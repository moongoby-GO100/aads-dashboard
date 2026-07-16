import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl font-bold text-gray-200 mb-4">404</p>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">페이지를 찾을 수 없습니다</h2>
        <p className="text-sm text-gray-500 mb-6">요청한 페이지가 존재하지 않거나 이동되었습니다.</p>
        <Link href="/" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          대시보드로 돌아가기
        </Link>
      </div>
    </div>
  );
}
