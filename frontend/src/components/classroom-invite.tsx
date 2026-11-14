"use client";

import { toast } from "sonner";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, Copy, Download, LoaderCircle, Share2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Feedback } from "@/components/feedback";
import { classroomInviteUrl, parseClassroomInvite } from "@/lib/classroom-invites";
import type { IScannerControls } from "@zxing/browser";

export function ClassroomInvite({ code, title, enabled }: { code: string; title: string; enabled: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const id = useId();
  const [url, setUrl] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!code || !enabled) return;
    let active = true;
    const link = classroomInviteUrl(window.location.origin, code);
    import("qrcode").then(async QRCode => {
      if (!active || !canvas.current) return;
      await QRCode.toCanvas(canvas.current, link, { width: 240, margin: 4, errorCorrectionLevel: "M" });
      if (active) { setUrl(link); setReady(true); }
    }).catch(() => { if (active) setError("Chưa tạo được mã QR. Bạn vẫn có thể chia sẻ mã tham gia."); });
    return () => { active = false; };
  }, [code, enabled]);

  async function copy() {
    setError("");
    try { await navigator.clipboard.writeText(url); toast.success("Đã sao chép link mời. Bạn có thể gửi cho một người hoặc nhóm."); }
    catch { setError("Chưa sao chép được. Hãy chọn và sao chép link bên dưới."); }
  }
  async function share() {
    setError("");
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: `Tham gia lớp ${title}`, text: `Mời bạn tham gia lớp ${title} trên StudyFlow AI.`, url }); }
    catch (err) { if (!(err instanceof DOMException && err.name === "AbortError")) setError("Chưa chia sẻ được. Bạn có thể sao chép link để gửi."); }
  }
  function download() {
    if (!canvas.current || !ready) return;
    const link = document.createElement("a");
    link.href = canvas.current.toDataURL("image/png"); link.download = "studyflow-classroom-qr.png"; link.click();
  }
  if (!code) return <p className="text-sm leading-relaxed text-muted-foreground">Tạo mã tham gia để lấy link mời và QR. Link có thể gửi cho một người hoặc cả nhóm.</p>;
  if (!enabled) return <p className="text-sm text-muted-foreground">Mở tham gia lớp để sử dụng link mời và mã QR.</p>;
  return <section className="space-y-4 border-t pt-4" aria-label="Mời thành viên bằng link và QR">
    <div><h3 className="font-semibold">Mời cá nhân hoặc nhóm</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Chia sẻ link hoặc QR. Người nhận đăng nhập và tự xác nhận tham gia lớp.</p></div>
    <div className="flex flex-wrap items-start gap-5">
      <div className="max-w-full"><canvas ref={canvas} aria-label={`Mã QR tham gia lớp ${title}`} role="img" className="max-w-full rounded-lg bg-white" />{!ready && !error && <p className="text-xs text-muted-foreground">Đang tạo QR…</p>}<Button variant="link" className="min-h-11 px-0" disabled={!ready} onClick={download}><Download />Tải QR</Button></div>
      <div className="min-w-0 flex-1 basis-60 space-y-3"><Label htmlFor={id}>Link mời tham gia</Label><Input id={id} readOnly value={url} className="min-h-11" onFocus={event => event.target.select()} /><div className="flex flex-wrap gap-2"><Button disabled={!ready} onClick={copy} className="min-h-11"><Copy />Sao chép link</Button><Button variant="outline" disabled={!ready} onClick={share} className="min-h-11"><Share2 />Chia sẻ lời mời</Button></div><p className="text-xs leading-relaxed text-muted-foreground">Đổi mã lớp sẽ làm link và QR cũ hết hiệu lực. Khi thử bằng điện thoại, dùng địa chỉ triển khai hoặc địa chỉ mạng truy cập được từ điện thoại.</p></div>
    </div><Feedback error={error} />
  </section>;
}

export function ClassroomScanner({ onCode }: { onCode: (code: string) => void }) {
  const id = useId();
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const media = useRef<MediaStream | null>(null);
  const session = useRef(0);
  const [running, setRunning] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { session.current += 1; controls.current?.stop(); media.current?.getTracks().forEach(track => track.stop()); }, []);
  function stop() { session.current += 1; controls.current?.stop(); controls.current = null; media.current?.getTracks().forEach(track => track.stop()); media.current = null; setRunning(false); }
  function accept(text: string) {
    const code = parseClassroomInvite(text, window.location.origin);
    if (!code) { setError("QR không chứa mã lớp hoặc link mời hợp lệ của StudyFlow trên địa chỉ này."); return; }
    onCode(code);
  }
  async function start() {
    if (running || reading) return;
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError("Camera cần HTTPS hoặc localhost. Bạn có thể tải ảnh QR bên dưới."); return; }
    const current = ++session.current;
    setRunning(true);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (current !== session.current || !video.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (current !== session.current || !video.current) { stream.getTracks().forEach(track => track.stop()); return; }
      media.current = stream;
      const scanner = await new BrowserQRCodeReader().decodeFromStream(stream, video.current, (result, _, scannerControls) => {
        if (current !== session.current) { scannerControls.stop(); return; }
        if (result) { scannerControls.stop(); stop(); accept(result.getText()); }
      });
      if (current !== session.current) scanner.stop(); else controls.current = scanner;
    } catch { if (current === session.current) { stop(); setError("Không mở được camera. Kiểm tra quyền truy cập hoặc dùng ảnh QR."); } }
  }
  async function readImage(file?: File) {
    if (!file || reading) return;
    stop(); setReading(true); setError("");
    const current = ++session.current;
    const url = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      if (current === session.current) accept(result.getText());
    } catch { if (current === session.current) setError("Không đọc được QR trong ảnh. Hãy chọn ảnh rõ mã hoặc nhập mã lớp."); }
    finally { URL.revokeObjectURL(url); if (current === session.current) setReading(false); }
  }
  return <div className="space-y-4"><video ref={video} muted playsInline aria-label="Camera quét QR lớp học" className="aspect-video w-full rounded-xl bg-muted object-cover" /><div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={running || reading} onClick={start}><Camera />{running ? "Đang quét…" : "Mở camera"}</Button>{running && <Button variant="outline" className="min-h-11" onClick={stop}><Square />Dừng camera</Button>}</div><div className="field"><Label htmlFor={id}>Hoặc chọn ảnh có mã QR</Label><Input id={id} type="file" accept="image/*" disabled={reading} className="h-auto min-h-11" onChange={event => { void readImage(event.target.files?.[0]); event.target.value = ""; }} />{reading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Đang đọc ảnh…</p>}</div><Feedback error={error} /><p className="text-xs leading-relaxed text-muted-foreground">QR được xử lý trên thiết bị. Sau khi đọc mã, bạn vẫn cần nhấn Tham gia để xác nhận.</p></div>;
}
