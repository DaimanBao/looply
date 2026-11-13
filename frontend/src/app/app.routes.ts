import { Routes } from '@angular/router';
import { activeGuard, publicGuard, sessionGuard } from './core/auth/auth.guards';
import { listingEditorGuard } from './features/listing/guards/listing-editor.guard';
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [publicGuard],
    loadComponent: () =>
      import('./features/listing/pages/discovery.page').then((m) => m.DiscoveryPage),
  },
  {
    path: 'listings/new',
    canActivate: [activeGuard],
    canDeactivate: [listingEditorGuard],
    loadComponent: () => import('./features/listing/pages/editor.page').then((m) => m.EditorPage),
  },
  {
    path: 'listings/:listingId/edit',
    canActivate: [activeGuard],
    canDeactivate: [listingEditorGuard],
    loadComponent: () => import('./features/listing/pages/editor.page').then((m) => m.EditorPage),
  },
  {
    path: 'account/listings',
    canActivate: [activeGuard],
    loadComponent: () =>
      import('./features/listing/pages/my-listings.page').then((m) => m.MyListingsPage),
  },
  {
    path: 'listings/:listingId',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/listing/pages/detail.page').then((m) => m.DetailPage),
  },
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/pages/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/register',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/auth/pages/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'auth/reset',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/auth/pages/reset.page').then((m) => m.ResetPage),
  },
  {
    path: 'account',
    canActivate: [activeGuard],
    loadComponent: () => import('./features/user/pages/account.page').then((m) => m.AccountPage),
  },
  {
    path: 'account/edit',
    canActivate: [activeGuard],
    loadComponent: () =>
      import('./features/user/pages/edit-profile.page').then((m) => m.EditProfilePage),
  },
  {
    path: 'account/username',
    canActivate: [activeGuard],
    loadComponent: () => import('./features/user/pages/username.page').then((m) => m.UsernamePage),
  },
  {
    path: 'account/contacts',
    canActivate: [activeGuard],
    loadComponent: () => import('./features/user/pages/contacts.page').then((m) => m.ContactsPage),
  },
  {
    path: 'account/password',
    canActivate: [activeGuard],
    loadComponent: () => import('./features/user/pages/password.page').then((m) => m.PasswordPage),
  },
  {
    path: 'account/sessions',
    canActivate: [activeGuard],
    loadComponent: () => import('./features/user/pages/sessions.page').then((m) => m.SessionsPage),
  },
  {
    path: 'account/blocked',
    canActivate: [activeGuard],
    data: { kind: 'blocked' },
    loadComponent: () =>
      import('./features/user/pages/relationships.page').then((m) => m.RelationshipsPage),
  },
  {
    path: 'account/deletion',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/user/pages/deletion.page').then((m) => m.DeletionPage),
  },
  {
    path: 'users/:userId/followers',
    canActivate: [publicGuard],
    data: { kind: 'followers' },
    loadComponent: () =>
      import('./features/user/pages/relationships.page').then((m) => m.RelationshipsPage),
  },
  {
    path: 'users/:userId/following',
    canActivate: [publicGuard],
    data: { kind: 'following' },
    loadComponent: () =>
      import('./features/user/pages/relationships.page').then((m) => m.RelationshipsPage),
  },
  {
    path: 'users/:userId',
    canActivate: [publicGuard],
    loadComponent: () =>
      import('./features/user/pages/public-profile.page').then((m) => m.PublicProfilePage),
  },
  { path: '**', redirectTo: '' },
];
