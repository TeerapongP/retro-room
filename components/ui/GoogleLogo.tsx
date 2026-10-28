import Image from "next/image";
import googleG from "@/public/art/google-g.png";

export function GoogleLogo({ className = "" }: { className?: string }) {
  return <Image src={googleG} alt="" aria-hidden unoptimized className={className} />;
}
