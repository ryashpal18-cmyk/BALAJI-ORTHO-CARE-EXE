# WhatsApp connected but PDF sending is unconfirmed

The screenshot shows a monthly PDF job in `unconfirmed`, while the paired client is connected. That proves the application attempted sending but did not receive a usable result. It does not prove whether the message reached the recipient; check that chat before manually retrying. The old generic error did not retain the underlying exception.

The pinned whatsapp-web.js 1.34.7 source has two independently reproduced compatibility problems:

1. Newer MediaData models spread a private `__x_id` into the outgoing message. That conflicts with the message ID and breaks document sending. The fix removes that private field after constructing the message (upstream PR https://github.com/wwebjs/whatsapp-web.js/pull/201923).
2. Some WA Web MsgKey models expose `$1` / `toString()` instead of `_serialized`, so the post-send lookup returns no message even after dispatch. Restore the compatible prototype getter/setter (upstream PR https://github.com/wwebjs/whatsapp-web.js/pull/201901). The application also accepts both serialized formats for number lookup and send acknowledgment.

`whatsapp-compat.cjs` applies the small patches to the pinned installed dependency during `npm ci` through postinstall. The packaged app uses that patched dependency. Repeating installation is idempotent; a changed source/version fails the build for review instead of silently applying a mismatched patch. There is no dependency upgrade, runtime download or session reset.

Both text and PDF sends use `sendSeen:false`; updating a chat's read status is not required to send a message. PDF failures now retain their actual exception and stage in the durable job and show these under “भेजना कहाँ रुका — कारण देखें”. Unknown send outcomes remain unconfirmed and are never automatically retried. Existing unconfirmed jobs are not changed to sent or automatically broadcast again.

`tests/whatsapp-compat.cjs` executes the real injected connector code against synthetic WhatsApp models. It reproduces the media collision and missing-result failures before patching, checks both ID formats and old constructor setters after patching, verifies repeat installation, and tests automatic new-bill PDF sending, text sending, durable error detail and duplicate prevention with a fake client. No actual WhatsApp account or recipient is contacted. Actual phone delivery still requires verification on the user's PC.
