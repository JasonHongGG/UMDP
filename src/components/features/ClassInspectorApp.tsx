import React from 'react';
import { Hexagon, Layers3, ChevronRight, LoaderCircle, Waypoints, Plus } from 'lucide-react';
import type { AnalysisClassInfo, AnalysisFieldInfo, AnalysisStaticFieldInfo } from '../../domain/analysis/view-models';
import type { ClassBinding } from '../../domain/studio/editor';
import type { InspectorTab } from '../../domain/analysis/AnalysisWorkspaceContext';

interface ClassInspectorAppProps {
  classInfo: AnalysisClassInfo;
  classLookupMap: Map<string, { imageStableId: string; classStableId: string; name: string; namespace: string; imageName: string }>;
  navigateToType: (typeName: string) => void;
  runtimeStaticFields: AnalysisStaticFieldInfo[];
  runtimeFields: AnalysisFieldInfo[];
  isLoadingRuntimeFields: boolean;
  runtimeFieldError: string | null;
  activeTab: InspectorTab | null;
  onSetReferenceTarget?: (fullName: string) => void;
  onAddToStudio?: (binding: ClassBinding) => void;
}

export default function ClassInspectorApp({
  classInfo,
  classLookupMap,
  navigateToType,
  runtimeStaticFields,
  runtimeFields,
  isLoadingRuntimeFields,
  runtimeFieldError,
  activeTab,
  onSetReferenceTarget,
  onAddToStudio,
}: ClassInspectorAppProps) {
  const activeTabImageName = activeTab?.imageName ?? classLookupMap.get(classInfo.fullName)?.imageName ?? 'Unknown Assembly';

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-6 z-10 w-full h-full">

      <div className="flex flex-col gap-1 pb-4 border-b border-[#1c2838]">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent font-mono">
            {classInfo.name}
          </h1>
          {onSetReferenceTarget && (
            <button
              onClick={() => onSetReferenceTarget(classInfo.fullName)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all shrink-0"
              title="Find references to this class"
            >
              <Waypoints size={16} />
            </button>
          )}
          {onAddToStudio && (
            <button
              onClick={() => activeTab && onAddToStudio({
                imageStableId: activeTab.imageStableId,
                classStableId: activeTab.classStableId,
                fullName: classInfo.fullName,
                name: classInfo.name,
                namespace: classInfo.namespace,
                imageName: activeTabImageName,
              })}
              className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all shrink-0"
              title="Add this class as a Studio node"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1"><Hexagon size={12} className="text-cyan-500" /> {classInfo.namespace || 'Global'}</span>
          <span className="flex items-center gap-1"><Layers3 size={12} className="text-blue-500" /> {activeTabImageName}</span>
        </div>
      </div>

      <Card title="Inheritance hierarchy">
        <div className="flex flex-wrap gap-2 items-center">
          {classInfo.inheritance.length ? classInfo.inheritance.map((node, index) => (
            <div key={`${node.name}-${index}`} className="flex items-center gap-2">
              <TypeLink typeName={node.name} lookupMap={classLookupMap} onNavigate={navigateToType} className="px-2 py-1 bg-[#131b26] border border-[#1c2838] rounded-md text-xs font-mono" />
              {index < classInfo.inheritance.length - 1 && <ChevronRight size={14} className="text-slate-600" />}
            </div>
          )) : <span className="text-xs text-slate-500">No inheritance metadata available.</span>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6">

        <Card
          title="Static State"
          action={runtimeFieldError && <span className="text-[10px] text-red-400">{runtimeFieldError}</span>}
        >
          <Table
            headers={['Type', 'Name', 'Address', 'Value']}
            columnClassNames={['min-w-[10rem]', 'min-w-[12rem]', 'min-w-[10rem] whitespace-nowrap', 'min-w-[8rem]']}
            data={runtimeStaticFields.map((f, index) => [
              <TypeLink key={`stype-${index}`} typeName={f.fieldType} lookupMap={classLookupMap} onNavigate={navigateToType} className="text-yellow-400" />,
              <span key={`sname-${index}`} className="text-slate-200">{f.name}</span>,
              <span key={`saddr-${index}`} className="text-cyan-400 font-mono text-[10px] whitespace-nowrap">{f.address ?? '?'}</span>,
              <span key={`sval-${index}`} className="text-yellow-400 font-mono text-[10px] break-all">{f.value ?? '?'}</span>
            ])}
          />
        </Card>

        <Card title="Instance Layout" action={isLoadingRuntimeFields && <LoaderCircle className="animate-spin text-cyan-400" size={14} />}>
          <Table
            headers={['Offset', 'Type', 'Name']}
            data={runtimeFields.map((f, index) => [
              <span key={`offset-${index}`} className="text-cyan-400">0x{f.offset?.toUpperCase() ?? '?'}</span>,
              <TypeLink key={`type-${index}`} typeName={f.fieldType} lookupMap={classLookupMap} onNavigate={navigateToType} className="text-yellow-400" />,
              <span key={`name-${index}`} className="text-slate-200">{f.name}</span>
            ])}
          />
        </Card>

        <div>
          <Card title="Callable Methods">
            <Table
              headers={['Method', 'Signature']}
              data={classInfo.methods.map((m, index) => [
                <div key={`mname-${index}`} className="flex flex-wrap items-center gap-2">
                  {(m.tags ?? []).map((tag) => (
                    <MethodTag key={`${m.name}-${tag}`} tag={tag} />
                  ))}
                  <span className="text-blue-300 font-semibold">{m.name}</span>
                </div>,
                <span key={`msig-${index}`} className="text-slate-400 text-[10px] break-all whitespace-pre-wrap leading-tight">
                  {renderSignatureWithLinks(m.signature, classLookupMap, navigateToType)}
                </span>
              ])}
            />
          </Card>
        </div>

      </div>

    </div>
  );
}

// Internal standard layout utilities
function Card({ title, children, action }: { title: string, children: React.ReactNode, action?: React.ReactNode }) {
  return (
    <div className="bg-[#05080c]/80 border border-[#1c2838] rounded-xl overflow-hidden flex flex-col shadow-lg backdrop-blur-sm">
      <div className="px-4 py-2 border-b border-[#1c2838] bg-[#0a0f16] flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</span>
        {action && <div>{action}</div>}
      </div>
      <div className="p-4 flex-1">
        {children}
      </div>
    </div>
  );
}

function Table({ headers, data, columnClassNames = [] }: { headers: string[], data: React.ReactNode[][], columnClassNames?: string[] }) {
  if (data.length === 0) return <div className="text-xs text-slate-500 font-mono italic">No data</div>;
  return (
    <div className="overflow-x-auto w-full">
      <table className="min-w-full w-max text-left text-xs font-mono">
        <thead>
          <tr className="border-b border-[#1c2838]">
            {headers.map((h, i) => (
              <th key={i} className={`pb-2 font-medium text-slate-500 uppercase tracking-widest whitespace-nowrap pr-6 ${columnClassNames[i] ?? ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className={`py-2 pr-6 align-top max-w-[200px] xl:max-w-none ${columnClassNames[j] ?? ''}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TypeLink({ typeName, onNavigate, lookupMap, className = "" }: { typeName: string, onNavigate: (t: string) => void, lookupMap: Map<string, any>, className?: string }) {
  const isTypeKnown = lookupMap.has(typeName);

  if (!isTypeKnown) {
    return <span className={className}>{typeName}</span>;
  }

  return (
    <button
      onClick={() => onNavigate(typeName)}
      className={`cursor-pointer transition-all text-left hover:brightness-125 ${className}`}
    >
      {typeName}
    </button>
  );
}

function MethodTag({ tag }: { tag: string }) {
  const tone = METHOD_TAG_STYLES[tag] ?? 'border-slate-600/70 bg-slate-900/80 text-slate-300';

  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold tracking-widest ${tone}`}>
      {tag}
    </span>
  );
}

const METHOD_TAG_STYLES: Record<string, string> = {
  CTOR: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  STATIC: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
  GETTER: 'border-lime-500/50 bg-lime-500/10 text-lime-300',
  SETTER: 'border-teal-500/50 bg-teal-500/10 text-teal-300',
  EVENT_ADD: 'border-pink-500/50 bg-pink-500/10 text-pink-300',
  EVENT_REMOVE: 'border-rose-500/50 bg-rose-500/10 text-rose-300',
  VIRTUAL: 'border-violet-500/50 bg-violet-500/10 text-violet-300',
  OVERRIDE: 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300',
  ABSTRACT: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  EXTERN: 'border-rose-500/50 bg-rose-500/10 text-rose-300',
  GENERIC: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300',
  OPERATOR: 'border-orange-500/50 bg-orange-500/10 text-orange-300',
  INSTANCE: 'border-slate-500/50 bg-slate-500/10 text-slate-300',
};

function renderSignatureWithLinks(
  signature: string,
  lookupMap: Map<string, any>,
  onNavigate: (t: string) => void
) {
  const tokens = signature.split(/(\b[\w.]+\b)/);
  return tokens.map((token, i) => {
    if (lookupMap.has(token)) {
      return (
        <button
          key={i}
          onClick={() => onNavigate(token)}
          className="text-yellow-400 hover:brightness-125 cursor-pointer transition-all"
        >
          {token}
        </button>
      );
    }
    return <span key={i}>{token}</span>;
  });
}
