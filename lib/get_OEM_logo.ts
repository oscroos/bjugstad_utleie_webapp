export function getOEMLogo(make?: string | null) {
  if (!make) return null;

  const normalized = make.trim().toLowerCase();

  if (normalized === "volvo") return "/oem-logos/volvo_logo.svg";
  if (normalized === "liebherr") return "/oem-logos/liebherr_logo.svg";
  if (normalized === "hydrema") return "/oem-logos/hydrema_logo.svg";
  if (normalized === "drivex") return "/oem-logos/drivex_logo.svg";
  if (normalized === "cat") return "/oem-logos/CAT_logo.svg";
  if (normalized === "fendt") return "/oem-logos/fendt_logo.svg";
  if (normalized === "pandrol") return "/oem-logos/pandrol_logo.svg";
  if (normalized === "kawasaki") return "/oem-logos/kawasaki_logo.svg";
  if (normalized === "ariens") return "/oem-logos/ariens_logo.svg";
  if (normalized === "avant") return "/oem-logos/avant_logo.png";
  if (normalized === "asp") return "/oem-logos/asp_logo.png";
  if (normalized === "bsb") return "/oem-logos/bsb_logo.png";
  if (normalized === "tokvam") return "/oem-logos/tokvam_logo.png";
  if (normalized.includes("rosenqvist")) return "/oem-logos/rosenqvist-rail_logo.png";
  if (normalized.includes("entrack")) return "/oem-logos/entrack_logo.png";
  if (normalized.includes("aquarius")) return "/oem-logos/aquarius_logo.jpg";
  if (normalized.includes("jcb")) return "/oem-logos/JCB_logo.svg";
  if (normalized.includes("intermercato") || normalized.includes("inntermercato") || normalized.includes("intermecato")) {
    return "/oem-logos/intermercato_logo.png";
  }
  if (normalized.includes("leica")) return "/oem-logos/leica_logo.svg";
  if (normalized.includes("sA,rling") || normalized.includes("sorling")) {
    return "/oem-logos/sorling_logo.svg";
  }
  if (normalized.includes("dalen")) return "/oem-logos/dalen_logo.png";
  if (normalized.includes("heatwork")) return "/oem-logos/heatwork_logo.jpg";
  if (normalized.includes("ifor williams") || normalized.includes("ifor-williams")) {
    return "/oem-logos/ifor-williams_logo.jpg";
  }
  if (normalized.includes("quicke") || normalized === "ålø" || normalized === "alo") {
    return "/oem-logos/quicke_logo.png";
  }
  if (normalized === "engcon" || normalized === "encon") {
    return "/oem-logos/engcon_logo.jpg";
  }
  if (normalized.includes("can am") || normalized.includes("can-am") || normalized === "brp") {
    return "/oem-logos/can-am_logo.png";
  }
  if (normalized.includes("massey ferguson")) return "/oem-logos/massey-ferguson_logo.png";
  if (normalized.includes("tellefsdal")) return "/oem-logos/schmidt-tellefsdal_logo.png";
  if (normalized.includes("svetruck")) return "/oem-logos/svetruck_logo.png";
  if (normalized.includes("prinoth")) return "/oem-logos/prinoth_logo.jpg";
  if (
    normalized.includes("d-and-a") ||
    normalized.includes("danda") ||
    normalized.includes("d and a") ||
    normalized.includes("d&a")
  ) {
    return "/oem-logos/d-and-a_logo.jpg";
  }
  if (normalized.includes("gjerstad")) return "/oem-logos/gjerstad_logo.png";
  if (normalized.includes("greenmerch") || normalized.includes("greenmech")) {
    return "/oem-logos/greenmech_logo.png";
  }
  if (normalized.includes("john deere")) return "/oem-logos/john-deere_logo.png";
  if (normalized.includes("klepp")) return "/oem-logos/klepp_logo.png";

  return null;
}
