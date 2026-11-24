// Featured Listing Boost — shared by client and server.
//
// The server re-checks the paid amount against this value, so changing the
// price here changes it everywhere (the Pi payment is created with it, and the
// approve/complete routes reject payments that do not match).
export const BOOST_PRICE_PI = 5;

// How long a boost keeps a listing at the top of Home / category feeds.
export const BOOST_DURATION_DAYS = 7;

// Pi memo limit is 28 characters.
export const BOOST_MEMO = "Featured boost · 7 days";
