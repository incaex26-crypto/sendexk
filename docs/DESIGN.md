# SenDexk design guide

The approved screens are in docs/design/ (six .dc.html files plus map.svg). They are a visual and markup reference. They use a few custom tags ({{holes}}, <sc-if>, <sc-for>, <x-dc>): convert them to normal HTML, CSS and plain JavaScript (zero dependencies). Do not copy the custom tags into the app.

## Look
- Light, friendly, bank-like. Page and map background #EAF0F5, sheets and cards white, soft grey fills #F3F6FA, borders #D5DCE6, dark navy text #0F1B2D, secondary text #5B6B7F, accent blue #2563E8 (buttons, routes, selected states), selected fill #E6F0FF.
- Font: Manrope (400-800). Rounded corners 14-24px. Buttons at least 48px tall, main button 54px.
- Mobile first (390px wide). Customer, driver and business screens are map-first with a bottom sheet. Admin is a fluid desktop page that also works on a phone.
- Real map: MapLibre with data/maps/jhb.pmtiles, styled to match map.svg (light land, white roads, pale blue water, pale green parks, yellow highways). Route line #2563E8 with a white outline.
- No gradients, no emoji, no glow, no stock-AI look. Icons are simple inline SVG strokes.
- Put every colour in CSS variables at the top of public/app.css.

## Screens and what they connect to
1 Home (index): pickup and drop-off by search, suburb list or dragging pins on the map. Saved places for businesses.
2 Choose delivery: price per vehicle class (bike, car, van) from the existing pricing code, delivery windows (Now, or a booked window), one fixed price shown. Selecting a vehicle changes the price on the Continue button.
3 Confirm and pay: summary, recipient name and phone, pay with business wallet, card or instant EFT through the payment provider interface. Paying confirms the order.
4 Track: map, driver card, status steps, delivery code, updates driven by order events.
5 Driver: phone-code login, map with the trip route and numbered stops, pay and distance shown before accepting, Accept and Decline, then stop-by-stop screens with the delivery code entry.
6 Admin: login with named account, live map, stat tiles, needs-attention list, live trips table, ledger check.
Also needed (same style): business wallet and statement, store checkout link page, driver earnings and weekly statement, admin account/driver/business lists.

## Wording (South African English, plain, short)
Use: Send a parcel, Where to?, Choose a vehicle, Delivery fee, Pay now, Picked up, On the way, Delivered, Trip (for a batch of stops), Earnings, Wallet, Top up, Statement.
Never show on screen: demo, starter, escrow, hotspot, dispatch, ledger, payout, run (say trip), firm price (say "the price is fixed"), roll unconfirmed, ID numbers, error codes, developer terms.
Amounts: R125.00. Dates: Thu 29 Oct. Times: 14:30. No exclamation marks. Error messages say what happened and what to do next.
Code and docs may keep internal words (run, ledger). Only screens follow this list.
