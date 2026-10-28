# BJ BACKUP connection — 28 October 2026

The clinic backend is `xoabrnbigjadrhuldcpc`. Existing patient IDs, registration numbers, timestamps, bill values and payment histories are retained. This release does not reset the local cache or pending upload queue.

Install the new Windows and Android releases on all clinic devices. In Settings → Cloud Sync / Clinic cloud, connect to BJ BACKUP once with the existing clinic cloud credentials. Local offline login remains unchanged. A project change requires a new cloud session; old refresh tokens must not be copied between projects. Passwords and service-role keys are never bundled.

After installation, confirm the BJ BACKUP label, successful connection and pending sync completion. Stop entering new records in old builds connected to the old backend; two independent servers cannot safely allocate a single registration sequence. Keep the old cloud and local device backups until device sync and attachments have been checked.

The cloud snapshot covers data received by the old server at the recorded backup cutoff. Any records still offline on a PC or phone remain on that device and must sync after reconnecting. Do not clear queues, reset app data, or uninstall with data deletion.

Private data, Auth exports and backup attachments are stored separately and must never be committed to this repository.
