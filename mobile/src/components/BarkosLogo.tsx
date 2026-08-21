import { Image } from 'react-native'

type Props = {
  size?: number
}

export function BarkosLogo({ size = 24 }: Props) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size, borderRadius: Math.max(4, size * 0.22) }}
    />
  )
}
