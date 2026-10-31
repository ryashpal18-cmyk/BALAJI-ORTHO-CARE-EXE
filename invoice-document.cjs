'use strict';
const fs=require('fs'),path=require('path');
const {familyLink}=require('./family-profile.cjs');
const {canonicalVillage}=require('./village-names.cjs');
const {invoiceTemplate,INVOICE_TEMPLATE_VERSION}=require('./invoice-template.cjs');
const paymentQr='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'src/assets/payment-qr.png')).toString('base64');
const brandImage='data:image/jpeg;base64,'+fs.readFileSync(path.join(__dirname,'src/assets/invoice-brand.jpg')).toString('base64');
function invoiceDocument(bill,patient,qr){
 if(!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(qr))throw Error('QR image unavailable');
 return invoiceTemplate(bill,{...patient,address:canonicalVillage(patient.address)},{brandImage,qr,paymentQr,profileLink:familyLink(patient.id)});
}
module.exports={invoiceDocument,INVOICE_TEMPLATE_VERSION};
