import React from 'react';
import { Hexagon, Layers3, ChevronRight, LoaderCircle } from 'lucide-react';
import type { ClassInfo, FieldInfo, StaticFieldInfo } from '../../types';

interface ClassInspectorAppProps {
  classInfo: ClassInfo;
  classLookupMap: Map<string, { imageId: string; classId: string; name: string; namespace: string; imageName: string }>;
  navigateToType: (typeName: string) => void;
  runtimeStaticFields: StaticFieldInfo[];
  runtimeFields: FieldInfo[];
  isLoadingRuntimeFields: boolean;
  runtimeFieldError: string | null;
  activeTabId: string;
}

export default function ClassInspectorApp({
  classInfo,
  classLookupMap,
  navigateToType,
  runtimeStaticFields,
  runtimeFields,
  isLoadingRuntimeFields,
  runtimeFieldError,
  activeTabId
}: ClassInspectorAppProps) {
  const [activeTabImageId, activeTabClassId] = activeTabId.split('::');
  const activeTabImageName = classLookupMap.get(classInfo.full_name)?.imageName || 'Unknown Assembly';

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-6 z-10 w-full h-full">

      <div className="flex flex-col gap-1 pb-4 border-b border-[#1c2838]">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent font-mono">
          {classInfo.name}
        </h1>
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <Card title="Instance Layout" action={isLoadingRuntimeFields && <LoaderCircle className="animate-spin text-cyan-400" size={14} />}>
          <Table
            headers={['Offset', 'Type', 'Name']}
            data={runtimeFields.map((f, index) => [
              <span key={`offset-${index}`} className="text-cyan-400">0x{f.offset?.toUpperCase() ?? '?'}</span>,
              <TypeLink key={`type-${index}`} typeName={f.field_type} lookupMap={classLookupMap} onNavigate={navigateToType} className="text-yellow-400" />,
              <span key={`name-${index}`} className="text-slate-200">{f.name}</span>
            ])}
          />
        </Card>

        <Card
          title="Static State"
          action={runtimeFieldError && <span className="text-[10px] text-red-400">{runtimeFieldError}</span>}
        >
          <Table
            headers={['Type', 'Name', 'Address', 'Value']}
            data={runtimeStaticFields.map((f, index) => [
              <TypeLink key={`stype-${index}`} typeName={f.field_type} lookupMap={classLookupMap} onNavigate={navigateToType} className="text-yellow-400" />,
              <span key={`sname-${index}`} className="text-slate-200">{f.name}</span>,
              <span key={`saddr-${index}`} className="text-cyan-400 font-mono text-[10px] break-all">{f.address ?? '?'}</span>,
              <span key={`sval-${index}`} className="text-yellow-400 font-mono text-[10px] break-all">{f.value ?? '?'}</span>
            ])}
          />
        </Card>

        <div className="xl:col-span-2">
          <Card title="Callable Methods">
            <Table
              headers={['Method', 'Signature']}
              data={classInfo.methods.map((m, index) => [
                <span key={`mname-${index}`} className="text-blue-300 font-semibold">{m.name}</span>,
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

function Table({ headers, data }: { headers: string[], data: React.ReactNode[][] }) {
  if (data.length === 0) return <div className="text-xs text-slate-500 font-mono italic">No data</div>;
  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full text-left text-xs font-mono">
        <thead>
          <tr className="border-b border-[#1c2838]">
            {headers.map((h, i) => (
              <th key={i} className="pb-2 font-medium text-slate-500 uppercase tracking-widest whitespace-nowrap pr-6">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-6 align-top max-w-[200px] xl:max-w-none">{cell}</td>
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
