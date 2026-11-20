import type { GuestRequestSettings, StoredTrackRequest } from "../infrastructure/guest-request-repository";

export interface GuestRequestRepository {
  findActiveEvent(eventId:string):Promise<{id:string}|null>;
  insertGuest(guest:{id:string;eventId:string;nickname:string}):Promise<void>;
  findEventGuest(guestId:string,eventId:string):Promise<{id:string}|null>;
  readGuestRequestSettings():Promise<GuestRequestSettings>;
  countRecentGuestRequests(guestId:string):Promise<number>;
  findActiveTrackRequest(eventId:string,trackId:string):Promise<{id:string;status?:string}|null>;
  insertTrackRequest(request:StoredTrackRequest):Promise<void>;
  createDjQueueGuest(eventId:string):Promise<string>;
  appendRequestToQueueOrder(requestId:string):Promise<void>;
  findEventRequestStatus(eventId:string,requestId:string):Promise<{id:string;status:string}|null>;
  readAutoQueueSetting():Promise<boolean>;
  updateRequestStatus(eventId:string,requestId:string,status:string,timestampColumn:"approved_at"|"queued_at"|"played_at"|null):Promise<void>;
  moveApprovedRequestToQueue(eventId:string,requestId:string):Promise<boolean>;
}
