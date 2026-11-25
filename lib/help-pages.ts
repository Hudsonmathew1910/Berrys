/**
 * Help & policy pages (defaults; the dashboard can override each one under
 * Website content). Shipping fees and the returns window are shown live from
 * Settings above the text, so the policies refer to them instead of repeating
 * numbers. Razorpay requires privacy, terms, refund and contact pages.
 * The size guide is still PLACEHOLDER copy.
 */
export type HelpPage = { title: string; eyebrow: string; sections: { heading?: string; body: string[] }[] };

export const helpPages: Record<string, HelpPage> = {
  "size-guide": {
    title: "Size guide",
    eyebrow: "FIND THE RIGHT FIT",
    sections: [
      {
        body: [
          "Our pieces come in S, M, L and XL. Sizes can vary slightly between styles, so check the product description too.",
          "S — 2–3 years · M — 4–5 years · L — 6–7 years · XL — 8–9 years (guide only; final measurements to be confirmed).",
          "Between sizes? Choose the bigger one — they grow fast!",
        ],
      },
    ],
  },
  "shipping-returns": {
    title: "Shipping & returns",
    eyebrow: "DELIVERY, MADE SIMPLE",
    sections: [
      {
        heading: "Shipping",
        body: [
          "We deliver across India. Your order is packed and handed to our courier once payment is confirmed, usually within 2 working days.",
          "Delivery normally takes 3 to 7 working days after dispatch, depending on your PIN code. Remote areas can take longer.",
          "Shipping charges, if any, are shown above and in your bag before you pay. You can follow every step (packed, shipped, delivered) and the courier tracking number in My account → My orders.",
          "Please check your delivery address carefully. If a parcel comes back to us because the address was wrong or nobody was available after the courier's attempts, we will contact you; re-shipping may be charged.",
        ],
      },
      {
        heading: "Cancelling an order",
        body: [
          "Changed your mind before your order arrives? Open the order in My account → My orders and request a refund. If it hasn't shipped yet, we cancel it and refund the full amount.",
          "If it has already shipped, we refund it once the parcel comes back to us.",
        ],
      },
      {
        heading: "Returns",
        body: [
          "If something isn't right (wrong size, damaged, not as described, or the wrong item), request a refund from My account → My orders within the returns window shown above, counted from the day of delivery. You can choose the whole order or just some pieces, and tell us the reason.",
          "To be returned, items must be unused, unwashed and in their original condition with tags attached. For hygiene reasons we can't take back innerwear, socks or items marked as non-returnable on the product page, unless they arrived damaged or wrong.",
          "Our team reviews every request, usually within 2 working days, and may ask for photos. If we need the item back, we'll tell you how to send it. If an item arrived damaged or wrong, we cover the return shipping.",
        ],
      },
      {
        heading: "Refunds",
        body: [
          "Approved refunds go back to the original payment method (card, UPI, net banking or wallet) through Razorpay. We don't refund in cash or to a different account.",
          "Once we approve it, the money usually reaches you in 5 to 7 working days, depending on your bank. You can see the status of your request in My account → My orders.",
          "Shipping charges are refunded when the whole order is cancelled before dispatch, or when the return is due to our mistake.",
          "Questions about a refund? Contact us with your order number (it starts with BRY-).",
        ],
      },
    ],
  },
  contact: {
    title: "Get in touch",
    eyebrow: "WE’RE HERE TO HELP",
    sections: [
      {
        body: [
          "Questions about sizes, an order, a delivery or a refund? Reach us using the details above and we'll get back to you, usually within 1 working day.",
          "For anything about an order, please include your order number (it starts with BRY-). You can also follow your order and ask for a refund in My account → My orders.",
        ],
      },
    ],
  },
  "our-story": {
    title: "Our little story",
    eyebrow: "THE HEART OF BERRY’S",
    sections: [
      {
        body: [
          "Berry’s is a clothing brand for the everyday wonder of being little. Our collection brings together easy comfort, playful personality and pieces that make getting dressed a little happier.",
          "From slow mornings to big adventures, there’s a little favourite for every moment.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    eyebrow: "YOUR DATA",
    sections: [
      {
        body: [
          "This policy explains what personal information Berry's collects when you use this website, why, who we share it with, and the choices you have. By using the website you agree to this policy.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "Account details: your name, email address and profile picture from Google when you log in with Google, or your email address when you log in with an emailed code.",
          "Order details: your mobile number, delivery addresses, the items you buy, order history, refund requests and messages you send us.",
          "Payment details: Razorpay processes all payments. We receive the payment status and a reference number, but never your card number, UPI PIN or bank login.",
          "Technical details: your IP address and browser type when you log in, place an order or send a form, used to keep your account secure and stop abuse.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "To create and run your account, process and deliver your orders, handle refunds, send order and login emails, answer your questions, prevent fraud and abuse, and meet our legal and tax obligations.",
          "We don't sell your information, and we don't use it for third-party advertising.",
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          "Only with the services we need to run the shop, and only what each one needs: Google (login), Razorpay (payments and refunds), our courier partners (your name, phone and address, to deliver), Supabase (our database and photo storage, hosted in India), Vercel (website hosting) and our email provider (to send you emails).",
          "We may also share information when the law requires it, for example with tax authorities or in response to a valid legal request.",
        ],
      },
      {
        heading: "Cookies and your browser",
        body: [
          "We use one essential cookie to keep you logged in. Your bag and favourites are also saved in your browser so they are there when you come back.",
          "We don't use advertising or tracking cookies, and we don't use third-party analytics.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          "We keep your account details while your account is open. Order and payment records are kept for as long as Indian tax and accounting law requires (usually 8 years), even if you close your account. Security logs are deleted automatically after a short period.",
        ],
      },
      {
        heading: "Keeping it safe",
        body: [
          "Your information is stored on secure servers and sent over encrypted (HTTPS) connections. Only our team members who need it for their work can see it, and every dashboard action is logged. No system is perfectly secure, but we work hard to protect your data.",
        ],
      },
      {
        heading: "Your choices and rights",
        body: [
          "You can see and update your name, mobile number and addresses in My account at any time.",
          "You can ask us for a copy of your information, ask us to correct it, or ask us to delete your account. We'll do so unless we must keep certain records by law (such as invoices).",
          "Our website is meant for adults. If you are under 18, please use it with a parent or guardian.",
        ],
      },
      {
        heading: "Contact and grievances",
        body: [
          "For any privacy question, request or complaint, contact us using the details on our Get in touch page. Our grievance officer will acknowledge your complaint within 48 hours and resolve it within 30 days.",
          "We may update this policy from time to time. The latest version is always on this page.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms & conditions",
    eyebrow: "THE SMALL PRINT",
    sections: [
      {
        body: [
          "These terms apply when you use the Berry's website and buy from us. By using the website or placing an order, you agree to them. Please also read our Privacy policy and Shipping & returns policy, which form part of these terms.",
        ],
      },
      {
        heading: "Your account",
        body: [
          "You log in with your Google account or an emailed code. You are responsible for keeping access to your email account safe and for everything done through your Berry's account.",
          "Please give accurate details, especially your name, mobile number and delivery address. We may suspend accounts used for fraud or abuse.",
        ],
      },
      {
        heading: "Products and prices",
        body: [
          "We try to show our products, colours and sizes as accurately as possible, but screens vary and handmade or dyed fabrics can differ slightly from the photos.",
          "All prices are in Indian Rupees (₹) and include applicable taxes. Shipping charges, if any, are shown before you pay. Prices and offers can change at any time, but the price you pay is the one shown at checkout.",
          "If a product is listed at a clearly wrong price because of an error, we may cancel the order and refund you in full.",
        ],
      },
      {
        heading: "Orders and payment",
        body: [
          "An order is confirmed only when payment succeeds and you receive our confirmation. Payments are processed securely by Razorpay.",
          "Stock is reserved for you while you pay. If payment isn't completed within 30 minutes, the order is cancelled and the stock released.",
          "We may cancel an order if an item turns out to be out of stock, if we suspect fraud, or if we can't deliver to your address. If we cancel a paid order, we refund the full amount to your original payment method.",
        ],
      },
      {
        heading: "Delivery, cancellations and returns",
        body: ["Delivery, cancellations, returns and refunds are covered by our Shipping & returns policy."],
      },
      {
        heading: "Using the website",
        body: [
          "Please don't misuse the website: no attempts to break its security, collect other people's data, place fake orders, or copy our content for commercial use.",
          "All photos, designs, text and the Berry's name and logo belong to Berry's and may not be used without our written permission.",
        ],
      },
      {
        heading: "Our responsibility",
        body: [
          "We do our best to keep the website available and accurate, but we can't promise it will always be error-free or uninterrupted.",
          "To the extent the law allows, our total responsibility for any order is limited to the amount you paid for it. Nothing in these terms limits your rights under the Consumer Protection Act, 2019.",
        ],
      },
      {
        heading: "Law and disputes",
        body: [
          "These terms are governed by the laws of India. If you have a complaint, please contact us first using the details on our Get in touch page; we'll acknowledge it within 48 hours and aim to resolve it within 30 days. Any dispute we can't settle together will be handled by the competent courts in India.",
          "We may update these terms from time to time. The version on this page when you place an order applies to that order.",
        ],
      },
    ],
  },
};
