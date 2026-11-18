/*
 * Wedding site settings.
 *
 * apiUrl: paste the Web App URL you get when you deploy the Google Apps Script
 *         (it ends in /exec). While it's empty, the site runs in DEMO MODE with
 *         sample guests, so you can try everything without any setup.
 */
window.WEDDING_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbxq63x2tbT-8Tw-YRfUWb5LkO1ghd_Hqm00NxSAgQwCAdqTLy-D53LvfhfUKDM0M4m1qw/exec',

  // Shown to everyone before they RSVP
  names: ['Paolo', 'Margaret'],
  dateText: 'February 06, 2027',
  cityText: 'Tagaytay City',
  // Only used until a guest's code is checked; after that the deadline comes from your Sheet.
  rsvpDeadlineText: 'January 6, 2027'
};
