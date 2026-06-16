import CityClient from "@/components/CityClient";
import ProfilePanel from "@/components/ProfilePanel";
import CityHeader from "@/components/CityHeader";
import InfoBanner from "@/components/InfoBanner";
import PlayModal from "@/components/PlayModal";
import WalkHud from "@/components/WalkHud";
import MiniMap from "@/components/MiniMap";
import StreetEntryModal from "@/components/StreetEntryModal";
import AgentChat from "@/components/AgentChat";
import VoiceController from "@/components/VoiceController";

export default function Home() {
  return (
    <main data-city className="relative h-screen w-screen overflow-hidden">
      <CityClient />

      <CityHeader />

      <ProfilePanel />
      <InfoBanner />
      <PlayModal />
      <WalkHud />
      <MiniMap />
      <VoiceController />
      <StreetEntryModal />
      <AgentChat />

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3 text-[10px] text-off/70">
        {/* Long hint on tablet+, short on phones — saves a row of vertical space. */}
        <span className="hidden bg-on px-2 py-1 tracking-wider sm:inline">
          1 building = 1 holder · facade shows every Normie · click monument · drag = orbit · F = fly · ENTER STREET VIEW to walk
        </span>
        <span className="bg-on px-2 py-1 tracking-wider sm:hidden">
          drag · pinch · tap to open
        </span>
      </footer>
    </main>
  );
}
