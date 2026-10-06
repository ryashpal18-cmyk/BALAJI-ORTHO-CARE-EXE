// Test-only dependency: @electric-sql/pglite (or PGLITE_MODULE_PATH). No production database used.
const {PGlite}=require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const pg=new PGlite();
 await pg.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean); CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,name text);`);
 for(const f of fs.readdirSync(root+'/supabase/migrations').sort()){
  console.log('Migration',f);await pg.exec(fs.readFileSync(root+'/supabase/migrations/'+f,'utf8'));
 }
 const admin='00000000-0000-4000-8000-000000000001',staff='00000000-0000-4000-8000-000000000002',patient='00000000-0000-4000-8000-000000000003',med='00000000-0000-4000-8000-000000000004',bill='00000000-0000-4000-8000-000000000005',event='00000000-0000-4000-8000-000000000006';
 await pg.exec(`INSERT INTO auth.users VALUES('${admin}'),('${staff}'); INSERT INTO user_roles(user_id,role) VALUES('${admin}','admin'),('${staff}','staff'); INSERT INTO staff_access(user_id,display_name,allowed_pages) VALUES('${staff}','Test',ARRAY['/opd']); SELECT set_config('app.uid','${admin}',false); INSERT INTO patients(id,name,mobile) VALUES('${patient}','TEST','9123456780'); INSERT INTO medicines(id,name,rate,stock_quantity) VALUES('${med}','TEST',10,5); INSERT INTO billing(id,patient_id,service,amount,amount_paid,created_at) VALUES('${bill}','${patient}','Test',1000,200,'2026-10-01T10:00:00+05:30');`);
 await pg.query('SELECT adjust_stock_atomic($1,$2,$3)',[event,med,-3]);
 await pg.query('SELECT adjust_stock_atomic($1,$2,$3)',[event,med,-3]);
 assert.equal(Number((await pg.query('SELECT stock_quantity FROM medicines WHERE id=\''+med+'\'')).rows[0].stock_quantity),2);
 assert.equal((await pg.query('SELECT * FROM stock_movements')).rows.length,1);
 await assert.rejects(()=>pg.query('SELECT adjust_stock_atomic($1,$2,$3)',['00000000-0000-4000-8000-000000000007',med,-10]),/Insufficient/);
 assert.equal(Number((await pg.query('SELECT stock_quantity FROM medicines WHERE id=\''+med+'\'')).rows[0].stock_quantity),2);
 const before=(await pg.query('SELECT payment_history FROM billing')).rows[0].payment_history;
 const history=[...before,{id:event,amount:800,paid_at:'2026-10-05T10:00:00+05:30',payment_mode:'UPI'}];
 await pg.query('UPDATE billing SET amount_paid=1000,payment_history=$1 WHERE id=$2',[JSON.stringify(history),bill]);
 await pg.query('UPDATE billing SET amount_paid=1000,payment_history=$1 WHERE id=$2',[JSON.stringify(history),bill]);
 const after=(await pg.query('SELECT amount_paid,payment_history FROM billing')).rows[0];
 assert.equal(Number(after.amount_paid),1000);assert.equal(after.payment_history.length,2);assert.equal(after.payment_history[1].amount,800);
 await pg.exec(`SELECT set_config('app.uid','${staff}',false);`);
 assert.equal((await pg.query("SELECT can_use_pages(ARRAY['/billing']) AS ok")).rows[0].ok,false);
 assert.equal((await pg.query("SELECT can_use_pages(ARRAY['/opd']) AS ok")).rows[0].ok,true);
 await assert.rejects(()=>pg.query('SELECT adjust_stock_atomic($1,$2,$3)',[event,med,1]),/permission/);
 await pg.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated; SET ROLE authenticated;');
 assert.equal((await pg.query('SELECT * FROM billing')).rows.length,0);
 assert.equal((await pg.query('SELECT * FROM patients')).rows.length,1);
 await pg.exec('RESET ROLE;');

 const a='00000000-0000-4000-8000-000000000011',b='00000000-0000-4000-8000-000000000012',other='00000000-0000-4000-8000-000000000013';
 await pg.exec(`INSERT INTO branches(id,name) VALUES('${a}','Branch A'),('${b}','Branch B'); UPDATE patients SET branch_id='${a}' WHERE id='${patient}'; INSERT INTO patients(id,name,branch_id) VALUES('${other}','Branch B only','${b}'); INSERT INTO prescriptions(patient_id,medicines) VALUES('${other}','BRANCH_B_PRIVATE'); UPDATE staff_access SET allowed_pages=ARRAY['/opd','/daily-cash-book'],allowed_branches=ARRAY['${a}'::uuid] WHERE user_id='${staff}'; SET ROLE authenticated;`);
 assert.equal((await pg.query("SELECT * FROM patients WHERE id=$1",[other])).rows.length,0);
 assert.equal((await pg.query("SELECT * FROM prescriptions WHERE patient_id=$1",[other])).rows.length,0);
 assert.equal((await pg.query('DELETE FROM patients WHERE id=$1 RETURNING id',[patient])).rows.length,0);
 assert.equal((await pg.query('SELECT * FROM patients WHERE id=$1',[patient])).rows.length,1);


 await assert.rejects(()=>pg.query('SELECT delete_record_authorized($1,$2)',['patients',patient]),/Administrator/);
 await pg.query('SELECT append_audit_event($1,$2)',[event,JSON.stringify({action:'test',module:'opd',actor_name:'forged'})]);
 await pg.query('SELECT append_audit_event($1,$2)',[event,JSON.stringify({action:'test',module:'opd'})]);
 assert.equal((await pg.query('SELECT * FROM audit_logs')).rows.length,0);
 await pg.exec(`RESET ROLE; UPDATE staff_access SET allowed_branches=NULL WHERE user_id='${staff}'; INSERT INTO cash_book_days(entry_date,status,physical_cash,calculated_closing) VALUES('2026-10-06','closed',100,100); SET ROLE authenticated;`);
 await assert.rejects(()=>pg.exec("UPDATE cash_book_days SET status='open',physical_cash=0 WHERE entry_date='2026-10-06'"),/Administrator/);
 assert.equal((await pg.query("SELECT status FROM cash_book_days WHERE entry_date='2026-10-06'")).rows[0].status,'closed');
 console.log('PASS F04/F06/F08/F09 branch RLS, denied delete, write-only audit and cashbook reopen protection');
 await pg.exec(`RESET ROLE; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated; GRANT SELECT ON storage.objects TO authenticated; INSERT INTO storage.objects(id,bucket_id) VALUES('00000000-0000-4000-8000-000000000021','xray-files'); UPDATE staff_access SET enabled=false,allowed_pages='{}' WHERE user_id='${staff}'; SET ROLE authenticated;`);
 assert.equal((await pg.query('SELECT * FROM patients')).rows.length,0);
 assert.equal((await pg.query('SELECT * FROM storage.objects')).rows.length,0);
 console.log('PASS F10 disabled staff cannot read storage');
 await pg.exec('RESET ROLE;');
 assert.equal((await pg.query("SELECT public FROM storage.buckets WHERE id='prescriptions'")).rows[0].public,false);
 console.log('PASS F11 private prescription bucket');
 await pg.exec(fs.readFileSync(root+'/supabase/migrations/20261006120000_fix_deep_audit_f01_f16.sql','utf8'));
 console.log('PASS repeat migration');
 await pg.close();
})().catch(e=>{console.error(e.stack);process.exitCode=1});
