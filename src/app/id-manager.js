
class IdManager {
  constructor() {
    this.pageId = 0;
    this.requestId = 0;
    this.userRequestId = 0;
  }

  nextPageId() {
    return ++this.pageId;
  }

  nextRequestId() {
    return ++this.requestId;
  }

  nextUserRequestId() {
    return ++this.userRequestId;
  }
}

export default IdManager;