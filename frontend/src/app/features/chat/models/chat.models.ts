export interface ChatParticipant {
  userId: string;
  displayName: string;
  status: string;
}

export interface ChatListing {
  id: string;
  ownerId: string;
  title: string;
  type: 'SALE' | 'RENT' | 'EXCHANGE';
  status: 'ACTIVE' | 'HIDDEN' | 'DELETED';
  price: string | null;
  rentalUnit: 'DAY' | 'MONTH' | null;
  coverPath: string | null;
}

export interface ChatConversation {
  id: string;
  type: 'DIRECT' | 'LISTING';
  participants: ChatParticipant[];
  listing: ChatListing | null;
  unreadCount: number;
  hidden: boolean;
  createdAt: string;
  lastMessageAt: string | null;
}

export interface ChatProposal {
  id: string;
  kind: 'LISTED_PRICE' | 'NEGOTIATED_PRICE' | 'EXCHANGE_CONTACT';
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  type: ChatListing['type'];
  listedPrice: string | null;
  proposedPrice: string | null;
  rentalUnit: ChatListing['rentalUnit'];
}

export interface ChatSnapshot {
  listingId: string;
  title: string;
  type: ChatListing['type'];
  listedPrice: string | null;
  rentalUnit: ChatListing['rentalUnit'];
  imageAvailable: boolean;
  imagePath: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  requestId: string;
  type: 'TEXT' | 'TRANSACTION_CARD';
  content: string | null;
  createdAt: string;
  state: 'SENT' | 'DELIVERED' | 'READ';
  imagePath: string | null;
  proposal: ChatProposal | null;
  snapshot: ChatSnapshot | null;
}

export interface ChatPage<T> {
  data: T[];
  pagination: { nextCursor: string | null };
}

export interface ChatMessageInput {
  requestId: string;
  content?: string;
  imageMediaId?: string;
}

export interface ChatProposalInput {
  requestId: string;
  kind: ChatProposal['kind'];
  proposedPrice?: string;
}
