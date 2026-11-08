'use strict';
const fs=require('fs'),path=require('path');

// Reproducible compatibility patches for the pinned 1.34.7 dependency.
// Upstream: wwebjs/whatsapp-web.js PRs #201901 (MsgKey) and #201923 (media).
// Keep the patch in npm ci/installer builds, rather than editing an installed EXE.
function patchUtils(source){
  let result=source;
  const keyMarker='// Balaji compatibility: MsgKey serialization';
  if(!result.includes(keyMarker)){
    const anchor='    window.WWebJS = {};';
    if(result.split(anchor).length!==2)throw Error('WhatsApp MsgKey patch anchor changed; review dependency before building');
    result=result.replace(anchor,anchor+`
    ${keyMarker}
    const MsgKeyProto = window.require('WAWebMsgKey').prototype;
    if (!Object.getOwnPropertyDescriptor(MsgKeyProto, '_serialized')) {
        Object.defineProperty(MsgKeyProto, '_serialized', {
            get() { return this.$1 || this.toString(); },
            set(value) {
                Object.defineProperty(this, '_serialized', {
                    value, writable: true, enumerable: true, configurable: true,
                });
            },
            configurable: true,
        });
    }
`);
  }
  const mediaMarker='// Balaji compatibility: keep MediaData.__x_id out of the outgoing Msg';
  if(!result.includes(mediaMarker)){
    const anchor="        // Bot's won't reply if canonicalUrl is set (linking)";
    if(result.split(anchor).length!==2)throw Error('WhatsApp media patch anchor changed; review dependency before building');
    result=result.replace(anchor,`${mediaMarker}
        delete message.__x_id;

${anchor}`);
  }
  return result;
}
function patchClient(source){
  const marker='// Balaji compatibility: wait for WhatsApp auth and QR modules v2';
  if(source.includes(marker))return source;
  const authAnchor='        await this.pupPage.evaluate(ExposeAuthStore);';
  const qrAnchor=`                await this.pupPage.evaluate(async () => {
                    const registrationInfo =`;
  const legacyMarker='// Balaji compatibility: wait for WhatsApp auth modules';
  if(source.includes(legacyMarker)){
    const start=source.indexOf(legacyMarker),anchorAt=source.indexOf(authAnchor,start);
    if(anchorAt<0)throw Error('Legacy WhatsApp auth readiness patch is incomplete; reinstall dependency before building');
    source=source.slice(0,start)+authAnchor+source.slice(anchorAt+authAnchor.length);
  }
  if(source.split(authAnchor).length!==2||source.split(qrAnchor).length!==2)throw Error('WhatsApp readiness patch anchor changed; review dependency before building');
  source=source.replace(authAnchor,`${marker}
        const waitForBalajiModules = async (required, stage) => {
            let ready = false;
            const startedAt = Date.now();
            while (Date.now() - startedAt < this.options.authTimeoutMs) {
                try {
                    ready = await this.pupPage.evaluate((requirements) => {
                        return requirements.every(([moduleName, properties]) => {
                            try {
                                let value = moduleName === '__AuthStore'
                                    ? window.AuthStore
                                    : window.require(moduleName);
                                for (const property of properties) {
                                    if (value == null) return false;
                                    value = value[property];
                                }
                                return value != null;
                            } catch {
                                return false;
                            }
                        });
                    }, required);
                } catch {
                    ready = false;
                }
                if (ready) return;
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            throw new Error(\`WhatsApp Web \${stage} modules did not become ready before timeout\`);
        };
        await waitForBalajiModules([
            ['WAWebSocketModel', ['Socket']],
            ['WAWebCmd', ['Cmd']],
            ['WAWebConnModel', ['Conn']],
            ['WAWebOfflineHandler', ['OfflineMessageHandler']],
        ], 'authentication');

${authAnchor}`);
  return source.replace(qrAnchor,`                await waitForBalajiModules([
                    ['__AuthStore', ['RegistrationUtils', 'waSignalStore', 'getRegistrationInfo']],
                    ['__AuthStore', ['RegistrationUtils', 'waNoiseInfo', 'get']],
                    ['__AuthStore', ['Base64Tools', 'encodeB64']],
                    ['__AuthStore', ['Conn', 'on']],
                    ['WAWebUserPrefsMultiDevice', ['getADVSecretKey']],
                ], 'QR');

${qrAnchor}`);
}
function patchInstalledPackage(packageRoot=path.dirname(require.resolve('whatsapp-web.js/package.json'))){
  const version=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8')).version;
  if(version!=='1.34.7')throw Error('Review WhatsApp compatibility patches for dependency version '+version);
  const files=[
    [path.join(packageRoot,'src/Client.js'),patchClient],
    [path.join(packageRoot,'src/util/Injected/Utils.js'),patchUtils],
  ];
  let changed=false;
  for(const [file,patch] of files){
    const before=fs.readFileSync(file,'utf8'),after=patch(before);
    if(after!==before){fs.writeFileSync(file,after);changed=true;}
  }
  return changed;
}
if(require.main===module){patchInstalledPackage();console.log('WhatsApp 1.34.7 initialization/media/MsgKey compatibility patches verified');}
module.exports={patchUtils,patchClient,patchInstalledPackage};
