import { DiscoverSection } from '../components/landing/DiscoverSection'
import { EditorialGallery } from '../components/landing/EditorialGallery'
import { FinalCTA } from '../components/landing/FinalCTA'
import { Hero } from '../components/landing/Hero'
import { HowItWorks } from '../components/landing/HowItWorks'
import { IdeaSection } from '../components/landing/IdeaSection'
import { StylistPreviewSection } from '../components/landing/StylistPreviewSection'
import { WardrobeIntelligenceSection } from '../components/landing/WardrobeIntelligenceSection'
import { Footer } from '../components/layout/Footer'
import { LandingNav } from '../components/layout/LandingNav'

export function LandingPage() {
  return (
    <>
      <LandingNav />
      <main className="w-full overflow-x-hidden">
        <Hero />
        <EditorialGallery />
        <DiscoverSection />
        <HowItWorks />
        <WardrobeIntelligenceSection />
        <StylistPreviewSection />
        <IdeaSection />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}