import sprout from "lucide-static/icons/sprout.svg?raw";
import pickaxe from "lucide-static/icons/pickaxe.svg?raw";
import factory from "lucide-static/icons/factory.svg?raw";
import zap from "lucide-static/icons/zap.svg?raw";
import waves from "lucide-static/icons/waves.svg?raw";
import hardHat from "lucide-static/icons/hard-hat.svg?raw";
import shoppingBag from "lucide-static/icons/shopping-bag.svg?raw";
import truck from "lucide-static/icons/truck.svg?raw";
import utensils from "lucide-static/icons/utensils.svg?raw";
import radio from "lucide-static/icons/radio.svg?raw";
import landmark from "lucide-static/icons/landmark.svg?raw";
import building2 from "lucide-static/icons/building-2.svg?raw";
import briefcaseBusiness from "lucide-static/icons/briefcase-business.svg?raw";
import wrench from "lucide-static/icons/wrench.svg?raw";
import graduationCap from "lucide-static/icons/graduation-cap.svg?raw";
import heartPulse from "lucide-static/icons/heart-pulse.svg?raw";
import film from "lucide-static/icons/film.svg?raw";
import home from "lucide-static/icons/home.svg?raw";
import circleDot from "lucide-static/icons/circle-dot.svg?raw";

export const SECTOR_CONFIG = {
  A: { short: "Agricultura", color: "#64d98b", icon: sprout },
  B: { short: "Minería", color: "#a28d78", icon: pickaxe },
  C: { short: "Manufactura", color: "#f28a5b", icon: factory },
  D: { short: "Energía", color: "#f4c95d", icon: zap },
  E: { short: "Agua y saneamiento", color: "#4bb8e7", icon: waves },
  F: { short: "Construcción", color: "#d6a561", icon: hardHat },
  G: { short: "Comercio", color: "#ff6b57", icon: shoppingBag },
  H: { short: "Transporte", color: "#63a4ff", icon: truck },
  I: { short: "Alojamiento y comida", color: "#ff9f8e", icon: utensils },
  J: { short: "Información", color: "#9a82ff", icon: radio },
  K: { short: "Finanzas", color: "#7ccfbc", icon: landmark },
  L: { short: "Inmobiliarias", color: "#d4b0ff", icon: building2 },
  M: { short: "Profesionales", color: "#8c6cf0", icon: briefcaseBusiness },
  N: { short: "Servicios administrativos", color: "#b08ee8", icon: wrench },
  O: { short: "Administración pública", color: "#8793a8", icon: landmark },
  P: { short: "Enseñanza", color: "#5ac8ad", icon: graduationCap },
  Q: { short: "Salud", color: "#ef7e9b", icon: heartPulse },
  R: { short: "Arte y recreación", color: "#df75d8", icon: film },
  S: { short: "Otros servicios", color: "#21d4c2", icon: wrench },
  T: { short: "Hogares empleadores", color: "#b6a988", icon: home },
  U: { short: "Organizaciones externas", color: "#aeb6c4", icon: building2 },
  V: { short: "Sin actividad", color: "#6f7788", icon: circleDot },
  W: { short: "Dependencia privada", color: "#7b8aa4", icon: building2 },
  X: { short: "Dependencia pública", color: "#99a5b8", icon: landmark },
  9: { short: "Por verificar", color: "#596273", icon: circleDot },
};

export function sectorMeta(code) {
  return SECTOR_CONFIG[code] ?? { short: code, color: "#778196", icon: circleDot };
}
