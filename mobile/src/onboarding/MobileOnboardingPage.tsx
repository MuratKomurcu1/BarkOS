import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { BellRing, MessageSquare } from 'lucide-react-native'
import type { MobileOnboardingStep } from './mobile-onboarding-plan'
import { mobileOnboardingStyles as styles } from './mobile-onboarding-styles'
import type { MobileSessionView } from '../storage/session-view-preferences'
import { colors } from '../theme/mobile-theme'

export type NotificationOnboardingChoice = 'enable' | 'skip'
export type MobileOnboardingBusyChoice = MobileSessionView | NotificationOnboardingChoice | null

type Props = {
  step: MobileOnboardingStep
  width: number
  active: boolean
  busyChoice: MobileOnboardingBusyChoice
  error: string | null
  onSessionChoice: (view: MobileSessionView) => void
  onNotificationChoice: (choice: NotificationOnboardingChoice) => void
}

export function MobileOnboardingPage({
  step,
  width,
  active,
  busyChoice,
  error,
  onSessionChoice,
  onNotificationChoice
}: Props) {
  const busy = busyChoice !== null
  const isSessionView = step === 'session-view'

  return (
    <ScrollView
      style={[styles.page, { width }]}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      <View style={styles.content}>
        <View style={styles.iconSurface}>
          {isSessionView ? (
            <MessageSquare size={30} color={colors.textPrimary} />
          ) : (
            <BellRing size={30} color={colors.textPrimary} />
          )}
        </View>
        <Text style={styles.title}>
          {isSessionView ? 'Oturumlar nasıl açılsın?' : 'Uzaktayken haberdar olun'}
        </Text>
        <Text style={styles.body}>
          {isSessionView
            ? 'Desteklenen ajan oturumlarının bu cihazda terminalde mi sohbet arayüzünde mi açılacağını seçin. Görünümü değiştirmek için oturum sekmesine basılı tutabilir veya varsayılanı daha sonra Ayarlar bölümünden değiştirebilirsiniz.'
            : 'Bir ajan kararınıza ihtiyaç duyduğunda veya görevini tamamladığında bu cihazda bildirim alın.'}
        </Text>
      </View>

      <View style={styles.footer}>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {isSessionView ? (
          <SessionViewChoices busyChoice={busyChoice} disabled={busy} onChoice={onSessionChoice} />
        ) : (
          <NotificationChoices
            busyChoice={busyChoice}
            disabled={busy}
            onChoice={onNotificationChoice}
          />
        )}
      </View>
    </ScrollView>
  )
}

function SessionViewChoices({
  busyChoice,
  disabled,
  onChoice
}: {
  busyChoice: MobileOnboardingBusyChoice
  disabled: boolean
  onChoice: (view: MobileSessionView) => void
}) {
  return (
    <>
      <ChoiceButton
        label="Sohbet arayüzünü kullan"
        accessibilityLabel="Oturumları sohbet arayüzünde aç"
        primary
        busy={busyChoice === 'chat'}
        disabled={disabled}
        onPress={() => onChoice('chat')}
      />
      <ChoiceButton
        label="Terminalde kal"
        accessibilityLabel="Oturumları terminalde aç"
        busy={busyChoice === 'terminal'}
        disabled={disabled}
        onPress={() => onChoice('terminal')}
      />
    </>
  )
}

function NotificationChoices({
  busyChoice,
  disabled,
  onChoice
}: {
  busyChoice: MobileOnboardingBusyChoice
  disabled: boolean
  onChoice: (choice: NotificationOnboardingChoice) => void
}) {
  return (
    <>
      <ChoiceButton
        label="Bildirimleri etkinleştir"
        accessibilityLabel="Ajan bildirimlerini etkinleştir"
        primary
        busy={busyChoice === 'enable'}
        disabled={disabled}
        onPress={() => onChoice('enable')}
      />
      <ChoiceButton
        label="Şimdi değil"
        accessibilityLabel="Bildirimleri şimdilik atla"
        busy={busyChoice === 'skip'}
        disabled={disabled}
        onPress={() => onChoice('skip')}
      />
    </>
  )
}

function ChoiceButton({
  label,
  accessibilityLabel,
  primary = false,
  busy,
  disabled,
  onPress
}: {
  label: string
  accessibilityLabel?: string
  primary?: boolean
  busy: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      style={({ pressed }) => [
        primary ? styles.primaryButton : styles.secondaryButton,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled
      ]}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.bgBase : colors.textSecondary} />
      ) : (
        <Text style={primary ? styles.primaryButtonText : styles.secondaryButtonText}>{label}</Text>
      )}
    </Pressable>
  )
}
