import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ItadNotificationsService } from '../../services/itad-notifications';
import { NotificationsList } from '../../shared/notifications-list/notifications-list';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [RouterLink, MatIconModule, NotificationsList],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css'
})
export class Notifications {
  readonly notifications = inject(ItadNotificationsService);
}
