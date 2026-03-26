import { memo } from 'react';
import { Layers3 } from 'lucide-react';
import type { AnalysisImageInfo } from '@/domain/analysis/view-models';
import { EmptyPanel } from '@/shared/ui/EmptyPanel';
import { LoadingInline } from '@/shared/ui/LoadingInline';
import type { StableId } from '@/domain/contracts/shared-identity';

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

interface AssembliesColumnProps {
  images: AnalysisImageInfo[];
  filteredImages: AnalysisImageInfo[];
  selectedImage: AnalysisImageInfo | null;
  setSelectedImageStableId: (id: StableId) => void;
  loadingImages: boolean;
  imageSearch: string;
  setImageSearch: (search: string) => void;
  imageListRef: React.RefObject<HTMLDivElement | null>;
}

export const AssembliesColumn = memo(function AssembliesColumn({
  images,
  filteredImages,
  selectedImage,
  setSelectedImageStableId,
  loadingImages,
  imageSearch,
  setImageSearch,
  imageListRef
}: AssembliesColumnProps) {
  return (
    <div className="w-72 border-r border-[#1c2838] bg-[#0a0f16]/90 flex flex-col shrink-0 relative backdrop-blur-md">
      <div className="p-4 border-b border-[#1c2838]">
        <div className="flex items-center gap-2 mb-3">
          <Layers3 className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">Assemblies</h2>
        </div>
        <input
          className="w-full bg-[#05080c] border border-[#1c2838] rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
          value={imageSearch}
          onChange={(e) => setImageSearch(e.target.value)}
          placeholder="Filter DLL images..."
          disabled={!images.length}
        />
      </div>

      <div className="flex-1 overflow-y-auto slim-scrollbar p-2 space-y-1" ref={imageListRef}>
        {!images.length && !loadingImages ? <EmptyPanel icon={<Layers3 size={32} />} title="No image data" msg="Attach to a target." /> : null}
        {loadingImages ? <LoadingInline msg="Loading assemblies..." /> : null}
        {filteredImages.map((image) => (
          <button
            key={image.stableId}
            data-id={image.stableId}
            onClick={() => setSelectedImageStableId(image.stableId)}
            className={classNames(
              "w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex flex-col gap-0.5 border",
              selectedImage?.stableId === image.stableId
                ? "bg-cyan-500/20 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
            )}
          >
            <span className={classNames("text-sm font-medium truncate", selectedImage?.stableId === image.stableId ? "text-cyan-100" : "text-slate-300")}>
              {image.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
});
