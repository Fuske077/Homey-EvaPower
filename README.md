# EvaPower

**Inzicht in je AlphaESS omvormer en accu via Homey**

EvaPower is een fork van de originele AlphaESS Homey app, uitgebreid met:
- Accu rendement (dagelijks + gemiddeld)
- Tijd tot leeg/vol
- Opgesplitste netverbruik sensoren (laden/ontladen)
- Visuele iconen voor energiestromen
- Instelbare accucapaciteit

## 📦 Installatie (CLI via Homey Developer)
Deze app is niet via de Homey App Store beschikbaar. Je kunt hem handmatig installeren via de Homey CLI:

1. Zorg dat je Node.js en de Homey CLI hebt geïnstalleerd ([instructies](https://community.homey.app/t/how-to-cli-install-method/198))
2. Clone deze repository:
   ```bash
   git clone https://github.com/Fuske077/Homey-EvaPower.git
   cd Homey-EvaPower
   ```
3. Installeer de app op je Homey:
   ```bash
   homey app install
   ```

Of test live tijdens ontwikkeling:
```bash
homey app run --clean
```

## ⚙️ Instellingen
Bij het toevoegen van het apparaat kun je:
- Je systeemnummer (sysSn) invoeren
- De accucapaciteit instellen (1–6 kWh)
- Het verversingsinterval kiezen

## 💡 Ondersteunde metingen
- Batterijniveau (%)
- PV vermogen (W)
- Netverbruik via laden/ontladen (W)
- Accu geladen/ontladen vandaag (kWh)
- Tijd tot leeg/vol (u)
- Accu rendement vandaag (%)
- Gemiddeld rendement (%)

## 📸 Afbeelding en iconen
De app gebruikt eigen iconen in Homey-stijl (zwart/wit, clean).

---
© 2024 – Gebaseerd op de originele AlphaESS app door Tim Doorduyn. Deze versie is uitgebreid voor persoonlijk gebruik en open source beschikbaar.
