import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, FileText, FolderOpen, History, Layers3, MessageCircle, Quote, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { HomeAccount } from "@/components/home-account";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import "./home.css";

export default function Home() {
  return <div className="home-page">
    <a href="#main-content" className="home-skip">Đến nội dung chính</a>
    <header className="home-header home-container">
      <Brand />
      <nav aria-label="Khám phá StudyFlow" className="home-nav"><a href="#how-it-works">Cách học</a><a href="#features">Khám phá</a><a href="#for-you">Dành cho bạn</a></nav>
      <HomeAccount />
    </header>
    <main id="main-content">
      <section className="home-hero home-container">
        <div className="home-hero-copy">
          <Badge variant="outline" className="home-eyebrow-badge"><span className="home-dot" />KHÔNG GIAN HỌC TẬP CỦA BẠN</Badge>
          <h1>Từng trang nhỏ.<br />Những điều hiểu<br /><span>sâu hơn.</span></h1>
          <p>Từ tài liệu trên lớp đến câu hỏi của riêng bạn. Sắp xếp kiến thức, hỏi điều chưa rõ và tìm lại nguồn — trong cùng một không gian.</p>
          <div className="home-hero-actions"><Link href="/register" className={buttonVariants({ className: "home-button home-primary-cta" })}>Tạo không gian học tập<ArrowRight /></Link><a href="#how-it-works" className="home-text-link">Khám phá cách học<ArrowDown className="size-4" /></a></div>
          <div className="home-hero-note"><span><Check />Học từ tài liệu của bạn</span><span><Check />Trả lời kèm nguồn</span></div>
        </div>
        <figure className="home-learning-scene">
          <div className="home-scene-grid" aria-hidden="true" />
          <figcaption className="home-scene-caption"><span className="home-dot" />MỘT GÓC HỌC TẬP, NHIỀU KẾT NỐI<span className="home-scene-star" aria-hidden="true">✳</span></figcaption>
          <div className="home-document-sheet">
            <div className="home-sheet-top"><span className="home-file-icon"><FileText /></span><span>TÀI LIỆU CỦA BẠN</span><span className="home-sheet-mark">PDF</span></div>
            <h2>Kiến thức bắt đầu<br />từ một trang giấy.</h2>
            <div className="home-sheet-lines" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="home-highlight"><Quote className="size-4" /><span>Đọc để khám phá.<br /><strong>Hỏi để hiểu sâu.</strong></span></div>
          </div>
          <div className="home-question-note"><span className="home-note-icon"><MessageCircle className="size-5" /></span><div><span>ĐIỀU BẠN MUỐN HIỂU</span><strong>“Nội dung này có ý nghĩa gì?”</strong></div></div>
          <div className="home-source-note"><span className="home-source-check"><Check className="size-4" /></span><div><strong>Từ câu hỏi, tìm về nguồn</strong><span>Đối chiếu đoạn văn và trang tài liệu</span></div><ArrowUpRight className="size-4" /></div>
          <div className="home-scene-footer"><span>TÀI LIỆU</span><span aria-hidden="true">→</span><span>CÂU HỎI</span><span aria-hidden="true">→</span><span>HIỂU BIẾT</span></div>
        </figure>
      </section>
      <div className="home-principles"><div className="home-container"><span><FolderOpen />Kiến thức có tổ chức</span><span><Quote />Nguồn luôn rõ ràng</span><span><Users />Kết nối cùng lớp học</span><span><ShieldCheck />Phạm vi truy cập riêng</span></div></div>
      <section id="how-it-works" className="home-section home-container">
        <div className="home-section-heading"><div><p className="home-kicker">01 / MỘT NHỊP HỌC MỚI</p><h2>Ít loay hoay hơn.<br />Nhiều khoảnh khắc <span>“à, hiểu rồi”.</span></h2></div><p>Không cần bắt đầu với mọi thứ.<br />Chỉ cần một tài liệu và một câu hỏi.</p></div>
        <ol className="home-steps">{[
          { number: "01", icon: FileText, title: "Mang tài liệu vào", text: "Tạo môn học, sắp xếp chương và tải lên PDF có văn bản của bạn." },
          { number: "02", icon: MessageCircle, title: "Hỏi điều còn băn khoăn", text: "Khi tài liệu sẵn sàng, đặt câu hỏi, yêu cầu giải thích hoặc tóm tắt nội dung." },
          { number: "03", icon: BookOpen, title: "Hiểu và kiểm chứng", text: "Đọc câu trả lời, mở trang nguồn và tiếp tục câu chuyện trong lịch sử hội thoại." },
        ].map(({ number, icon: Icon, title, text }) => <li key={number}><div className="home-step-top"><span>{number}</span><Icon className="size-6" /></div><h3>{title}</h3><p>{text}</p></li>)}</ol>
      </section>
      <section id="features" className="home-features-section"><div className="home-container home-section">
        <div className="home-section-heading"><div><p className="home-kicker">02 / ĐỂ VIỆC HỌC LIỀN MẠCH</p><h2>Mọi thứ có chỗ.<br /><span>Tâm trí có khoảng trống.</span></h2></div><p>Tài liệu, câu hỏi và lớp học.<br />Kết nối đúng việc bạn đang cần.</p></div>
        <div className="home-feature-grid">
          <Card className="home-feature home-feature-main"><span className="home-feature-symbol"><Sparkles /></span><div><p className="home-feature-overline">TRỢ LÝ HỌC THEO TÀI LIỆU</p><h3>Câu trả lời có điểm tựa.</h3><p>Hỏi đáp dựa trên tài liệu đã chọn, kèm đoạn nguồn và số trang để đối chiếu. Khi chưa đủ căn cứ, hệ thống sẽ nói rõ.</p></div><div className="home-feature-source"><Quote className="size-5" /><span>Hiểu câu trả lời.<br /><strong>Biết nơi để kiểm chứng.</strong></span><BookOpen className="ml-auto size-6" /></div><Link href="/register" className="home-feature-link">Bắt đầu từ tài liệu của bạn<ArrowUpRight className="size-4" /></Link></Card>
          <Card className="home-feature"><span className="home-feature-symbol"><Layers3 /></span><h3>Một môn học.<br />Một không gian rõ ràng.</h3><p>Sắp xếp môn cá nhân, chương và tài liệu theo cách bạn học. Tách biệt nội dung riêng với tài liệu của lớp.</p><div className="home-folder-labels" aria-hidden="true"><span><FolderOpen className="size-4" />Môn học</span><span><FileText className="size-4" />Tài liệu</span></div></Card>
          <Card className="home-feature home-feature-history"><span className="home-feature-symbol"><History /></span><h3>Đừng để một ý hay<br />trôi mất.</h3><p>Lưu lại hội thoại, hỏi tiếp theo ngữ cảnh và tìm lại câu trả lời cùng nguồn khi cần ôn tập.</p><div className="home-history-line" aria-hidden="true"><span />Đặt câu hỏi<span />Hỏi sâu hơn<span />Xem lại</div></Card>
        </div>
      </div></section>
      <section id="for-you" className="home-section home-container">
        <div className="home-section-heading"><div><p className="home-kicker">03 / HỌC RIÊNG, KẾT NỐI CHUNG</p><h2>Mỗi vai trò.<br /><span>Một cách đồng hành.</span></h2></div><p>Chủ động trong việc học.<br />Rõ ràng trong việc chia sẻ.</p></div>
        <div className="home-roles"><article><span className="home-role-label"><BookOpen className="size-4" />DÀNH CHO SINH VIÊN</span><h3>Học theo nhịp của bạn.</h3><p>Giữ tài liệu cá nhân ngăn nắp, tham gia lớp bằng mã và dành thời gian cho những câu hỏi thật sự cần lời giải.</p><Link href="/register" className="home-text-link">Tạo tài khoản sinh viên<ArrowUpRight className="size-4" /></Link></article><article><span className="home-role-label"><Users className="size-4" />DÀNH CHO GIẢNG VIÊN</span><h3>Một lớp học, cùng kết nối.</h3><p>Tổ chức môn và lớp phụ trách, quản lý thành viên, công bố tài liệu đúng lớp để sinh viên có thể tiếp cận.</p><Link href="/login" className="home-text-link">Đăng nhập tài khoản giảng viên<ArrowUpRight className="size-4" /></Link></article></div>
      </section>
      <section className="home-container home-last-section"><div className="home-closing"><div><p className="home-kicker">TRANG TIẾP THEO LÀ CỦA BẠN</p><h2>Bắt đầu nhỏ.<br /><span>Hiểu xa hơn.</span></h2><p>Một tài liệu. Một câu hỏi. Một điều mới được hiểu.</p></div><div className="home-closing-actions"><Link href="/register" className={buttonVariants({ className: "home-button home-light-button" })}>Tạo tài khoản<ArrowRight /></Link><Link href="/login">Đã có tài khoản? Đăng nhập<ArrowUpRight className="size-4" /></Link></div></div></section>
    </main>
    <footer className="home-footer home-container"><div><Brand /><p>Học có chiều sâu. Tiến xa hơn.</p></div><nav aria-label="Liên kết cuối trang"><a href="#how-it-works">Cách học</a><Link href="/login">Đăng nhập</Link><Link href="/register">Đăng ký</Link></nav><span>Được tạo cho hành trình học của bạn.</span></footer>
  </div>;
}
