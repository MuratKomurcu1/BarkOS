import { WifiOff, Shield, Monitor, Clock, Globe } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'

export type TroubleshootSection = {
  id: string
  icon: React.ReactNode
  title: string
  steps: string[]
}

export const troubleshootCommonIssues: TroubleshootSection[] = [
  {
    id: 'wifi',
    icon: <WifiOff size={16} color={colors.textSecondary} />,
    title: 'Farklı Wi-Fi ağları',
    steps: [
      'Tailscale kullanılmıyorsa iki cihaz aynı yerel ağda olmalıdır.',
      'Ethernet ve Wi-Fi aynı alt ağı paylaşmalıdır.',
      'İki cihazda da Wi-Fi bağlantısını yeniden kurmayı deneyin.'
    ]
  },
  {
    id: 'firewall',
    icon: <Shield size={16} color={colors.textSecondary} />,
    title: 'Güvenlik duvarı 6768 numaralı bağlantı noktasını engelliyor',
    steps: [
      "macOS: Sistem Ayarları → Ağ → Güvenlik Duvarı — BarkOS'a izin verin.",
      "Windows: Defender Güvenlik Duvarı → Uygulamaya izin ver — özel ağlarda BarkOS'u etkinleştirin.",
      'Linux: sudo ufw allow 6768',
      'Kurumsal veya okul ağları doğrudan bağlantıyı engelleyebilir; kişisel erişim noktası deneyin.'
    ]
  },
  {
    id: 'desktop',
    icon: <Monitor size={16} color={colors.textSecondary} />,
    title: 'Masaüstü uygulaması çalışmıyor',
    steps: [
      'Bağlantıları kabul etmek için masaüstünde BarkOS açık olmalıdır.',
      "BarkOS'u yeniden başlatmayı deneyin; eşlikçi sunucu açılışta başlar.",
      'Güncellemeden sonra QR koduyla yeniden eşleştirme gerekebilir.'
    ]
  },
  {
    id: 'timeout',
    icon: <Clock size={16} color={colors.textSecondary} />,
    title: 'Bağlantı zaman aşımı',
    steps: [
      'Telefonunuzdaki Wi-Fi sinyal gücünü denetleyin.',
      'Bilgisayar listesine dönüp yeniden denemek için bilgisayarınıza dokunun.',
      'Zaman aşımı sürerse iki uygulamayı da yeniden başlatın.'
    ]
  },
  {
    id: 'tailscale',
    icon: <Globe size={16} color={colors.textSecondary} />,
    title: 'Tailscale bilgisayarına ulaşılamıyor',
    steps: [
      '100.x.x.x veya *.ts.net adresleri Tailscale üzerinden bağlanır; Tailscale açık kalmalıdır.',
      'iOS/Android tüneli takılırsa Tailscale uygulamasından kapatıp yeniden açın.',
      'Bilgisayarın uyanık ve tailnet ağında bağlı göründüğünü denetleyin.',
      'Yeniden bağlanma düzeltmeleri için Tailscale uygulamasını güncelleyin.'
    ]
  },
  {
    id: 'vpn',
    icon: <Shield size={16} color={colors.textSecondary} />,
    title: 'Başka bir VPN bağlantıyı etkiliyor',
    steps: [
      'Tailscale dışındaki VPN uygulamaları yerel trafiği uzak bir sunucuya yönlendirebilir.',
      "VPN'i kapatın veya bölünmüş tünel / yerel ağa izin ver seçeneğini etkinleştirin."
    ]
  }
]
