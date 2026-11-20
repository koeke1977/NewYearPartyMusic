import type { GuestRequestRepository } from "../application/guest-request-ports";
import {
  appendRequestToQueueOrder, countOpenGuestRequests, countRecentGuestRequests, createDjQueueGuest, findActiveEvent,
  findActiveTrackRequest, findEventGuest, findEventRequestStatus, insertGuest, insertGuestTrackRequest, insertTrackRequest,
  moveApprovedRequestToQueue, readAutoQueueSetting, readGuestRequestSettings, transitionRequestStatus,
  type GuestRequestDatabase,
} from "./guest-request-repository";

export function createGuestRequestRepository(db:GuestRequestDatabase):GuestRequestRepository {
  return {
    findActiveEvent:eventId=>findActiveEvent(db,eventId),
    insertGuest:guest=>insertGuest(db,guest),
    findEventGuest:(guestId,eventId)=>findEventGuest(db,guestId,eventId),
    readGuestRequestSettings:()=>readGuestRequestSettings(db),
    countRecentGuestRequests:guestId=>countRecentGuestRequests(db,guestId),
    countOpenGuestRequests:guestId=>countOpenGuestRequests(db,guestId),
    findActiveTrackRequest:(eventId,trackId)=>findActiveTrackRequest(db,eventId,trackId),
    insertGuestTrackRequest:(request,limits)=>insertGuestTrackRequest(db,request,limits),
    insertTrackRequest:request=>insertTrackRequest(db,request),
    createDjQueueGuest:eventId=>createDjQueueGuest(db,eventId),
    appendRequestToQueueOrder:requestId=>appendRequestToQueueOrder(db,requestId),
    findEventRequestStatus:(eventId,requestId)=>findEventRequestStatus(db,eventId,requestId),
    readAutoQueueSetting:()=>readAutoQueueSetting(db),
    transitionRequestStatus:(eventId,requestId,fromStatuses,status,column)=>transitionRequestStatus(db,eventId,requestId,fromStatuses,status,column),
    moveApprovedRequestToQueue:(eventId,requestId)=>moveApprovedRequestToQueue(db,eventId,requestId),
  };
}
