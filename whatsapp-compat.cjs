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
  const marker='// Balaji compatibility: wait for WhatsApp Web modules v3';
  if(source.includes(marker))return source;
  if(source.includes('// Balaji compatibility: wait for WhatsApp'))throw Error('An older WhatsApp readiness patch is installed; run a clean npm ci before building');
  const authAnchor='        await this.pupPage.evaluate(ExposeAuthStore);';
  const qrAnchor=`                await this.pupPage.evaluate(async () => {
                    const registrationInfo =`;
  if(source.split(authAnchor).length!==2||source.split(qrAnchor).length!==2)throw Error('WhatsApp readiness patch anchor changed; review dependency before building');
  source=source.replace(authAnchor,`${marker}
        // WhatsApp Web registers these modules only after its own bundles
        // finish loading, which takes far longer than the 30s authentication
        // timeout on a slow clinic connection. Wait separately, and report
        // exactly what is missing when the page never becomes usable.
        const balajiReadinessMs = Number(this.options.balajiReadinessMs) > 0
            ? Number(this.options.balajiReadinessMs)
            : 60000;
        const waitForBalajiModules = async (required, stage) => {
            const startedAt = Date.now();
            let report = null;
            while (Date.now() - startedAt < balajiReadinessMs) {
                try {
                    report = await this.pupPage.evaluate((requirements) => {
                        const missing = [];
                        for (const [moduleName, properties] of requirements) {
                            let value;
                            try {
                                value = moduleName === '__AuthStore'
                                    ? window.AuthStore
                                    : window.require(moduleName);
                            } catch {
                                value = null;
                            }
                            for (const property of properties) {
                                value = value == null ? null : value[property];
                            }
                            if (value == null) {
                                missing.push(properties.length
                                    ? moduleName + '.' + properties.join('.')
                                    : moduleName);
                            }
                        }
                        return {
                            missing,
                            webVersion: window.Debug && window.Debug.VERSION
                                ? String(window.Debug.VERSION)
                                : null,
                            hasRequire: typeof window.require === 'function',
                            page: String(document.title || '').slice(0, 40),
                            text: String((document.body && document.body.innerText) || '')
                                .replace(/\\s+/g, ' ')
                                .trim()
                                .slice(0, 120),
                        };
                    }, required);
                } catch (evaluationError) {
                    report = {
                        missing: ['page-unavailable'],
                        webVersion: null,
                        hasRequire: false,
                        page: '',
                        text: String((evaluationError && evaluationError.message) || evaluationError).slice(0, 120),
                    };
                }
                if (report && report.missing.length === 0) return;
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            const detail = report || { missing: ['unknown'], webVersion: null, hasRequire: false, page: '', text: '' };
            throw new Error(
                \`WhatsApp Web \${stage} modules not ready after \${Math.round(balajiReadinessMs / 1000)}s\` +
                \` [webVersion=\${detail.webVersion || 'none'} require=\${detail.hasRequire}\` +
                \` missing=\${detail.missing.slice(0, 4).join(',')} page="\${detail.page}" \${detail.text}]\`,
            );
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
