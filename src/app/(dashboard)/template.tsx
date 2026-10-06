// Har navigatsiyada qayta o'rnatiladi: skeleton ham, undan keyin keladigan kontent ham
// yumshoq paydo bo'ladi (`.page-stage` qoidasi globals.css da).
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-stage">{children}</div>;
}
