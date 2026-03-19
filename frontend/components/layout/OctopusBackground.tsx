'use client';

import { usePathname } from 'next/navigation';

const TENTACLES_URL = 'https://res.cloudinary.com/daowx6msw/image/upload/v1763893433/ChatGPT_Image_Nov_23_2025_12_23_46_PM_tqfwov.png';
const SINGLE_ARM_URL = 'https://res.cloudinary.com/daowx6msw/image/upload/v1763892372/ChatGPT_Image_Nov_23_2025_12_03_35_PM_mze4yt.png';

export function OctopusBackground() {
  const pathname = usePathname();

  const isHome = pathname === '/home';
  const isLogin = pathname === '/login';

  if (isHome) {
    return (
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden hidden md:block">
        <img
          src={TENTACLES_URL}
          alt=""
          loading="lazy"
          fetchPriority="low"
          className="absolute -bottom-20 -right-32 w-[600px] opacity-[0.12] rotate-12"
          aria-hidden="true"
        />
        <img
          src={SINGLE_ARM_URL}
          alt=""
          loading="lazy"
          fetchPriority="low"
          className="absolute -top-16 -left-24 w-[400px] opacity-[0.08] -rotate-45"
          aria-hidden="true"
        />
      </div>
    );
  }

  if (isLogin) {
    return (
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden hidden md:block">
        <img
          src={SINGLE_ARM_URL}
          alt=""
          loading="lazy"
          fetchPriority="low"
          className="absolute -bottom-16 -left-20 w-[450px] opacity-[0.15] rotate-12"
          aria-hidden="true"
        />
      </div>
    );
  }

  // App pages: subtle single arm in bottom-left corner
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden hidden md:block">
      <img
        src={SINGLE_ARM_URL}
        alt=""
        loading="lazy"
        fetchPriority="low"
        className="absolute -bottom-24 -left-20 w-[350px] opacity-[0.06]"
        aria-hidden="true"
      />
    </div>
  );
}
