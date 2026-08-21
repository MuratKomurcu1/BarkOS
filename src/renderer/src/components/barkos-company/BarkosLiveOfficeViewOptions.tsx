import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { BarkosLiveOfficeViewPreferencesController } from './use-barkos-live-office-view-preferences'

export function BarkosLiveOfficeViewOptions(props: {
  preferences: BarkosLiveOfficeViewPreferencesController
  motionOff: boolean
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <SlidersHorizontal className="size-3.5" />
          {translate('barkos.office.viewOptions', 'Görünüm seçenekleri')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="barkos-live-office-view-menu"
        aria-label={translate('barkos.office.viewOptions', 'Görünüm seçenekleri')}
        data-motion={props.motionOff ? 'off' : 'system'}
      >
        <DropdownMenuLabel>{translate('barkos.office.layout', 'Düzen')}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={props.preferences.density === 'compact'}
          onCheckedChange={(checked) =>
            props.preferences.setDensity(checked === true ? 'compact' : 'comfortable')
          }
          onSelect={(event) => event.preventDefault()}
        >
          {translate('barkos.office.compactRows', 'Satırları sıkıştır')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{translate('barkos.office.motion', 'Hareket')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={props.preferences.motion}
          onValueChange={(value) => {
            if (value === 'system' || value === 'off') {
              props.preferences.setMotion(value)
            }
          }}
        >
          <DropdownMenuRadioItem value="system">
            {translate('barkos.office.motionSystem', 'Sistem ayarını izle')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="off">
            {translate('barkos.office.motionOff', 'Animasyonu kapat')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
