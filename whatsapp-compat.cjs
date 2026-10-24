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
function patchInstalledPackage(packageRoot=path.dirname(require.resolve('whatsapp-web.js/package.json'))){
  const version=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8')).version;
  if(version!=='1.34.7')throw Error('Review WhatsApp compatibility patches for dependency version '+version);
  const file=path.join(packageRoot,'src/util/Injected/Utils.js'),before=fs.readFileSync(file,'utf8'),after=patchUtils(before);
  if(after!==before)fs.writeFileSync(file,after);
  return after!==before;
}
if(require.main===module){patchInstalledPackage();console.log('WhatsApp 1.34.7 media/MsgKey compatibility patches verified');}
module.exports={patchUtils,patchInstalledPackage};
