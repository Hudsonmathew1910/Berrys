/**
 * Help & policy pages. PLACEHOLDER copy — replace with Berry's real size
 * chart, shipping/returns policy, contact details, privacy policy and terms
 * before launch (Razorpay requires privacy, terms, refund and contact pages).
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
          "Orders are packed and dispatched after payment is confirmed. You can follow every step in My account → My orders.",
          "Delivery timelines and shipping charges will be confirmed before launch.",
        ],
      },
      {
        heading: "Returns & refunds",
        body: [
          "Our returns window and process will be published here before launch.",
          "Refunds are made to the original payment method through Razorpay.",
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
          "Customer support details (email, phone and hours) will be added before the store opens.",
          "For anything about an order, please include your order number (it starts with BRY-).",
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
          "We collect the details needed to run your account and deliver your orders: your Google name and email, your mobile number, and delivery addresses.",
          "Payments are processed by Razorpay; we never see or store your card details.",
          "The full privacy policy will be published here before launch.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms & conditions",
    eyebrow: "THE SMALL PRINT",
    sections: [{ body: ["Our terms of sale will be published here before launch."] }],
  },
};
