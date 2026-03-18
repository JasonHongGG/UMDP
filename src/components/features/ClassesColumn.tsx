import { Boxes, ChevronRight } from 'lucide-react';
import type { AnalysisClassSummary, AnalysisImageInfo } from '../../domain/analysis/view-models';
import { EmptyPanel } from '../common/EmptyPanel';
import type { StableId } from '../../domain/contracts/shared-identity';

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

interface ClassesColumnProps {
  images: AnalysisImageInfo[];
  selectedImage: AnalysisImageInfo | null;
  loadingImages: boolean;
  currentClasses: AnalysisClassSummary[];
  filteredClasses: AnalysisClassSummary[];
  classSearch: string;
  setClassSearch: (search: string) => void;
  classListRef: React.RefObject<HTMLDivElement | null>;
  activeTab: { imageStableId: StableId, classStableId: StableId } | null;
  handleClassClick: (item: AnalysisClassSummary) => void;
}

export function ClassesColumn({
  images,
  selectedImage,
  loadingImages,
  currentClasses,
  filteredClasses,
  classSearch,
  setClassSearch,
  classListRef,
  activeTab,
  handleClassClick
}: ClassesColumnProps) {
  return (
    <div className="w-80 border-r border-[#1c2838] bg-[#070a0f]/90 flex flex-col shrink-0 relative backdrop-blur-md">
      <div className="p-4 border-b border-[#1c2838]">
        <div className="flex items-center gap-2 mb-3">
          <Boxes className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">Classes</h2>
        </div>
        <input
          className="w-full bg-[#05080c] border border-[#1c2838] rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono"
          value={classSearch}
          onChange={(e) => setClassSearch(e.target.value)}
          placeholder="Filter classes..."
          disabled={!selectedImage}
        />
      </div>

      <div className="flex-1 overflow-y-auto slim-scrollbar p-2 space-y-1" ref={classListRef}>
        {!images.length && !loadingImages && !selectedImage && <EmptyPanel icon={<Boxes size={32} />} title="Classes" msg="Select an assembly module first." />}
        {selectedImage && !currentClasses.length ? <EmptyPanel icon={<Boxes size={32} />} title="No classes" msg="No visible classes found." /> : null}
        {filteredClasses.map((item) => {
          const isActiveTab = activeTab?.imageStableId === selectedImage?.stableId && activeTab?.classStableId === item.stableId;

          return (
            <button
              key={item.stableId}
              data-id={item.stableId}
              onClick={() => handleClassClick(item)}
              className={classNames(
                "w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center justify-between border group",
                isActiveTab
                  ? "bg-cyan-500/20 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                  : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
              )}
            >
              <div className="flex flex-col overflow-hidden pr-2">
                <span className={classNames("text-sm font-medium truncate", isActiveTab ? "text-cyan-100" : "text-slate-300 font-mono")}>{item.name}</span>
                <span className="text-[10px] text-slate-500 truncate">{item.namespace || 'Global Namespace'}</span>
              </div>
              <ChevronRight size={14} className={isActiveTab ? "text-cyan-400" : "text-transparent group-hover:text-slate-500"} />
            </button>
          )
        })}
      </div>
    </div>
  );
}
