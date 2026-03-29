/**
 * Generate VAPID keys for Web Push Notifications.
 * Run: npm run generate-vapid
 * Copy the output into your .env file.
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('# Lägg till dessa i din .env-fil:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:jesper.melin89@gmail.com`);
