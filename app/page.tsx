import CityClient from "@/components/CityClient";
import ProfilePanel from "@/components/ProfilePanel";
import CanvasStatusBanner from "@/components/CanvasStatus";
import SearchBar from "@/components/SearchBar";
import SyncBadge from "@/components/SyncBadge";
import InfoBanner from "@/components/InfoBanner";
import PlayModal from "@/components/PlayModal";

export default function Home() {
  return (
    <main data-city className="relative h-screen w-screen overflow-hidden">
      <CityClient />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="bg-off text-on px-2.5 py-1.5 text-sm tracking-widest">
              THE NORMIES CITY
            </div>
            <div className="hidden bg-on text-off/70 px-2 py-1 text-[10px] tracking-wider sm:block">
              live from{" "}
              <a className="underline" href="https://api.normies.art/" target="_blank" rel="noreferrer">
                api.normies.art
              </a>
            </div>
          </div>
          <SearchBar />
          <div className="pointer-events-auto flex flex-col items-end gap-1">
            <SyncBadge />
            <CanvasStatusBanner />
          </div>
        </div>
      </header>
      <ProfilePanel />
      <InfoBanner />
      <PlayModal />
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3 text-[10px] text-off/70">
        <span className="bg-on px-2 py-1 tracking-wider">
          1 building = 1 holder · facade shows every Normie · click monument for city hall · click TAG BATTLE wall to play · drag = orbit · F = fly
        </span>
      </footer>
    </main>
  );
}
