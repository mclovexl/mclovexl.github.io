/* Publishable key only. Account access is enforced by the server's RLS policies. */
window.UNIVERSE_CLOUD_CONFIG = Object.freeze({
  enabled: true,
  url: 'https://ktjtnwduryzxrbptgiuk.supabase.co',
  publishableKey: 'sb_publishable_VClv9E6DutMdy1I5gm8P2A_-ZDSrS7b',
  bucket: 'our-universe-private',
  album: 'our-universe',
  // Public client-side alias: this prevents plain-text display, not discovery
  // by someone who already knows or guesses the phone number.
  phoneAlias: Object.freeze({
    iterations: 600000,
    salt: 'wsoVzMrzmFbfOBssHxTEaA==',
    iv: '6sjdq+l0HdY9hmX4',
    data: 'FU8fO75L+SBq12cJkMGnwh8cT6xoEtK5+I9vu4ym8Co='
  })
});
