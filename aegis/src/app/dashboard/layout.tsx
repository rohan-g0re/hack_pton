import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-bg-surface overflow-auto min-h-screen pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}
