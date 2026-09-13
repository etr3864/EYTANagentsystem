'use client';

export function ClosedPane({ message }: { message: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center bg-[#0c0e14]">
      <div className="w-14 h-14 rounded-full bg-white/[0.06] grid place-items-center mb-5">
        <svg className="w-6 h-6 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <p className="text-[15px] leading-7 text-white/80 max-w-sm">{message}</p>
    </div>
  );
}
