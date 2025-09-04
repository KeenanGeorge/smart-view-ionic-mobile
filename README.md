# SmartView Mobile App

[![Ionic](https://img.shields.io/badge/Ionic-3880FF?style=for-the-badge&logo=ionic&logoColor=white)](https://ionicframework.com/)
[![Angular](https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.io/)
[![Capacitor](https://img.shields.io/badge/Capacitor-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)](https://capacitorjs.com/)

Official mobile application for SmartView, built with Ionic, Angular, and Capacitor.

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ (LTS recommended)
- npm 8+ or yarn 1.22+
- Ionic CLI: `npm install -g @ionic/cli`
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/KeenanGeorge/smart-view-ionic-mobile.git
   cd smart-view-ionic-mobile
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the development server**
   ```bash
   ionic serve
   ```
   This will start the development server at `http://localhost:4200`

## 📱 Platform Setup

### Android

```bash
# Add Android platform
ionic capacitor add android

# Open in Android Studio
ionic capacitor open android
```

### iOS (macOS only)

```bash
# Add iOS platform
ionic capacitor add ios

# Open in Xcode
ionic capacitor open ios
```

## 🛠 Development

### Project Structure

```
src/
├── app/                 # Main application module and components
├── assets/             # Static assets (images, fonts, etc.)
├── environments/       # Environment configurations
├── theme/              # Global styles and theming
└── index.html          # Main HTML file
```

### Available Scripts

- `npm start` or `ionic serve` - Start the development server
- `npm run build` - Build the app for production
- `npm test` - Run unit tests
- `npm run e2e` - Run end-to-end tests
- `ionic capacitor sync` - Sync web assets with native projects

## 📦 Building for Production

### Web
```bash
npm run build
```

### Android
```bash
ionic capacitor build android --prod --release
```

### iOS
```bash
ionic capacitor build ios --prod
# Then open Xcode to archive and distribute
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📬 Contact

Smart-View Technology Team - [mmupfururirwa@smartviewtechnology.co.za](mailto:mmupfururirwa@smartviewtechnology.co.za)

Project Link: [https://github.com/KeenanGeorge/smart-view-ionic-mobile](https://github.com/KeenanGeorge/smart-view-ionic-mobile)
