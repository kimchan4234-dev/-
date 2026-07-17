"use client";

export interface Attachment {
  url: string;
  name: string;
  type: string;
  size: number;
}

export function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove?: () => void;
}) {
  const isImage = attachment.type.startsWith("image/");
  return (
    <div className="relative inline-flex max-w-[140px] flex-shrink-0 flex-col items-start overflow-hidden rounded-xl border border-[#E5E4E2] bg-[#FAF9F6]">
      <div className="flex h-24 w-full items-center justify-center overflow-hidden bg-[#F3F2EE]">
        {isImage ? (
          <img
            src={attachment.url}
            alt={attachment.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 px-2 text-center text-[10px] text-[#6B6960]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
            <span className="max-w-[120px] truncate font-medium">{attachment.name}</span>
          </div>
        )}
      </div>
      <div className="flex w-full items-center justify-between gap-1 px-2 py-1">
        <span className="truncate text-[10px] text-[#6B6960]">
          {Math.round(attachment.size / 1024)} KB
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="grid h-4 w-4 place-items-center rounded-full bg-[#E5E4E2] text-[#6B6960] hover:bg-[#D1D0CE] hover:text-[#191919]"
            title="제거"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-2.5 w-2.5">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export function AttachmentGallery({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove?: (index: number) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-b border-[#F0EFEA] p-2">
      {attachments.map((a, i) => (
        <AttachmentPreview
          key={a.url + i}
          attachment={a}
          onRemove={onRemove ? () => onRemove(i) : undefined}
        />
      ))}
    </div>
  );
}
