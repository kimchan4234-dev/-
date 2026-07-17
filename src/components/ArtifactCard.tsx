"use client";

interface ArtifactCardProps {
  filename: string;
  content: string;
  url: string;
  size?: string;
}

export function ArtifactCard({ filename, content, url, size }: ArtifactCardProps) {
  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  };

  return (
    <div className="my-3 flex w-full items-center justify-between overflow-hidden rounded-xl border border-[#E5E4E2] bg-[#FAF9F6] shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-3 px-4 py-3 bg-opacity-60">
        <div className="flex h-10 w-8 flex-col items-center justify-center rounded-md border border-[#DDDAD1] bg-white text-[9px] font-bold text-[#A3A29A] shadow-sm transform -rotate-6">
          <span className="font-mono tracking-tight">&lt;/&gt;</span>
        </div>
        <div>
          <h4 className="truncate text-[13px] font-semibold text-[#191919]">
            {filename}
          </h4>
          <p className="mt-0.5 text-[10px] text-[#8A8881] font-medium tracking-wide">
            CODE ARTIFACT {size && ` · ${size}`}
          </p>
        </div>
      </div>
      <a
        onClick={(e) => {
          e.preventDefault();
          handleDownload();
        }}
        href={url}
        download={filename}
        className="mr-4 rounded-lg border border-[#D1D0CE] bg-white px-4 py-2 text-[12px] font-semibold text-[#191919] hover:bg-[#F3F2EE] active:scale-95"
      >
        다운로드
      </a>
    </div>
  );
}
