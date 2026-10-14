import MainArea from "@/components/rootLayout/MainArea";
import Sidebar from "@/components/rootLayout/Sidebar";

const RootLayout = () => {
  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full">
      <Sidebar />
      <MainArea />
    </div>
  );
};

export default RootLayout;