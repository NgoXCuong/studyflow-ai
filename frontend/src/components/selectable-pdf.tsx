"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, LoaderCircle, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback";
import type { PDFSelection } from "@/lib/study-materials";
import "pdfjs-dist/web/pdf_viewer.css";

export function SelectablePDF({ url, initialPage, onSelection }: {
  url: string; initialPage: number; onSelection: (value: PDFSelection | null) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const pageNumber = pdf ? Math.min(Math.max(1, page), pdf.numPages) : page;

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    async function load() {
      try {
        const library = await import("pdfjs-dist");
        if (cancelled) return;
        library.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        task = library.getDocument({ url });
        const value = await task.promise;
        if (!cancelled) { setPdf(value); setError(""); }
      } catch { if (!cancelled) setError("Chưa thể mở PDF để chọn văn bản. Bạn có thể thử lại hoặc mở file ở tab mới."); }
    }
    void load();
    return () => { cancelled = true; void task?.destroy(); };
  }, [url, revision]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(240, entries[0].contentRect.width - 24)));
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [error]);

  useEffect(() => {
    if (!pdf || !pageRef.current) return;
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    let textLayer: InstanceType<typeof import("pdfjs-dist")["TextLayer"]> | undefined;
    const host = pageRef.current;
    async function render() {
      setRendering(true); setError("");
      try {
        const [library, source] = await Promise.all([import("pdfjs-dist"), pdf!.getPage(pageNumber)]);
        if (cancelled) return;
        const base = source.getViewport({ scale: 1 });
        const scale = width / base.width * zoom;
        const viewport = source.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute("aria-hidden", "true");
        const text = window.document.createElement("div"); text.className = "textLayer";
        host.replaceChildren(canvas, text);
        host.style.width = `${viewport.width}px`; host.style.height = `${viewport.height}px`;
        host.style.setProperty("--total-scale-factor", String(scale));
        host.style.setProperty("--scale-round-x", "1px"); host.style.setProperty("--scale-round-y", "1px");
        renderTask = source.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        textLayer = new library.TextLayer({ textContentSource: source.streamTextContent(), container: text, viewport });
        await Promise.all([renderTask.promise, textLayer.render()]);
      } catch { if (!cancelled) setError("Không hiển thị được trang PDF này. Hãy thử lại hoặc mở file ở tab mới."); }
      finally { if (!cancelled) setRendering(false); }
    }
    void render();
    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel(); };
  }, [pdf, pageNumber, width, zoom]);

  useEffect(() => {
    function capture() {
      const selected = window.getSelection();
      const layer = pageRef.current?.querySelector(".textLayer");
      if (!selected || selected.isCollapsed || !layer?.contains(selected.anchorNode) || !layer.contains(selected.focusNode)) return;
      const text = selected.toString().trim();
      if (text) onSelection({ page_number: pageNumber, text });
    }
    window.document.addEventListener("selectionchange", capture);
    return () => window.document.removeEventListener("selectionchange", capture);
  }, [pageNumber, onSelection]);

  function go(next: number) { setPage(next); onSelection(null); window.getSelection()?.removeAllRanges(); }
  return <div className="overflow-hidden rounded-xl border border-primary/20 bg-muted/30">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-2 py-1.5">
      <div className="flex items-center gap-1"><Button variant="ghost" className="size-10" aria-label="Trang trước" disabled={!pdf || pageNumber <= 1} onClick={() => go(pageNumber - 1)}><ChevronLeft /></Button><span className="text-xs tabular-nums">Trang {pageNumber}/{pdf?.numPages ?? "…"}</span><Button variant="ghost" className="size-10" aria-label="Trang sau" disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => go(pageNumber + 1)}><ChevronRight /></Button></div>
      <div className="flex items-center gap-1"><Button variant="ghost" className="size-10" aria-label="Thu nhỏ PDF" disabled={zoom <= 0.75} onClick={() => setZoom(value => Math.max(0.75, value - 0.25))}><Minus /></Button><span className="text-xs tabular-nums">{Math.round(zoom * 100)}%</span><Button variant="ghost" className="size-10" aria-label="Phóng to PDF" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + 0.25))}><Plus /></Button></div>
    </div>
    {error ? <div className="p-4"><ErrorState message={error} retry={() => { setPdf(null); setRevision(value => value + 1); }} /></div> : <div ref={viewportRef} className="relative h-[68dvh] min-h-80 overflow-auto p-3">
      {rendering && <div role="status" className="sticky top-0 z-10 flex items-center justify-center gap-2 rounded-lg bg-card/95 p-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Đang tải trang PDF…</div>}
      <div ref={pageRef} className="relative mx-auto bg-white" aria-label={`Nội dung trang ${pageNumber}`} />
    </div>}
  </div>;
}
