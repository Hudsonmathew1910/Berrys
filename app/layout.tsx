import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:"Berry’s — Made for little adventures",description:'Thoughtfully chosen clothing for everyday adventures. Discover comfortable co-ords, playful essentials and little favourites at Berry’s.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
