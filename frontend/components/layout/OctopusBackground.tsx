'use client';

import { usePathname } from 'next/navigation';

const TENTACLES_URL = 'https://res.cloudinary.com/daowx6msw/image/upload/v1763893433/ChatGPT_Image_Nov_23_2025_12_23_46_PM_tqfwov.png';
const SINGLE_ARM_URL = 'https://res.cloudinary.com/daowx6msw/image/upload/v1763892372/ChatGPT_Image_Nov_23_2025_12_03_35_PM_mze4yt.png';
const EXTRA_ARMS_URL = 'https://res.cloudinary.com/daowx6msw/image/upload/v1763942777/%D7%92%D7%9B%D7%A2%D7%92%D7%9B%D7%A2_oyrwqj.png';

export function OctopusBackground() {
  const pathname = usePathname();

  const isHome = pathname === '/home';
  const isLogin = pathname === '/login';

  if (isHome) {
    return (
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Bottom-right cluster */}
        <img
          src={TENTACLES_URL}
          alt=""
          loading="lazy"
          fetchPriority="low"
          className="absolute -bottom-20 -right-32 w-[420px] md:w-[600px] opacity-[0.10] md:opacity-[0.14] rotate-12"
          aria-hidden="true"
        />
        {/* Top-left arm */}
        <img
          src={SINGLE_ARM_URL}
          alt=""
          loading="lazy"
          fetchPriority="low"
          className="absolute -top-16 -left-24 w-[280px] md:w-[400px] opacity-[0.06] md:opacity-[0.09] -rotate-45"
          aria-hidden="true"
        />
        {/* Extra arms — mid-right */}
        <img
          src={EXTRA_ARMS_URL}
          alt=""
          loading="lazy"
          fetchPriority="low"
          className="absolute top-1/3 -right-16 w-[300px] md:w-[450px] opacity-[0.07] md:opacity-[0.10] rotate-[-20deg]"
          aria-hidden="true"
        />
        {/* Extra arms — bottom-left */}
        <img
          src={EXTRA_ARMS_URL}
          alt=""
          loading="lazy"
          fetchPriority="low"
          className="absolute -bottom-24 -left-20 w-[260px] md:w-[380px] opacity-[0.06] md:opacity-[0.08] rotate-[160deg] scale-x-[-1]"
          aria-hidden="true"
        />
        {/* Single arm — mid-left accent */}
        <img
          src={SINGLE_ARM_URL}
          alt=""
          loading="lazy"
          fetchPriority="low"
          className="hidden md:block absolute top-[60%] -left-28 w-[300px] opacity-[0.06] rotate-[30deg]"
          aria-hidden="true"
        />
      </div>
    );
  }

  if (isLogin) {
    return (
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img
          src={SINGLE_ARM_URL}
          alt=""
          loading="lazy"
          fetchPriority="low"
          className="absolute -bottom-16 -left-20 w-[320px] md:w-[450px] opacity-[0.10] md:opacity-[0.15] rotate-12"
          aria-hidden="true"
        />
        <img
          src={EXTRA_ARMS_URL}
          alt=""
          loading="lazy"
          fetchPriority="low"
          className="absolute -bottom-10 -right-16 w-[280px] md:w-[400px] opacity-[0.06] md:opacity-[0.09] -rotate-12 scale-x-[-1]"
          aria-hidden="true"
        />
      </div>
    );
  }

  // App pages: subtle arms in corners
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <img
        src={SINGLE_ARM_URL}
        alt=""
        loading="lazy"
        fetchPriority="low"
        className="absolute -bottom-24 -left-20 w-[250px] md:w-[350px] opacity-[0.05] md:opacity-[0.07]"
        aria-hidden="true"
      />
      <img
        src={EXTRA_ARMS_URL}
        alt=""
        loading="lazy"
        fetchPriority="low"
        className="hidden md:block absolute -bottom-16 -right-20 w-[320px] opacity-[0.05] scale-x-[-1]"
        aria-hidden="true"
      />
    </div>
  );
}
