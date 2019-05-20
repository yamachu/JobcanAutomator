import { Observable, Subject } from 'rxjs';
import { distinctUntilChanged, filter, first } from 'rxjs/operators';
import { JobState } from './Contract';

interface ControllWindowIds {
    windowId: number;
    tabId: number;
}

interface ResponseHeader {
    mimeType: string;
    url: string;
}

interface ResponseBody extends ResponseHeader {
    body: any;
    requestId: string;
}

const enum MenuID {
    Base = 'JobcanAutomator',
    Attendance = 'JobcanAutomator@attendance',
    Leave = 'JobcanAutomator@leave',
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        title: 'JobcanAutomator',
        id: MenuID.Base,
        contexts: ['all'],
        type: 'normal',
        documentUrlPatterns: ['https://ssl.jobcan.jp/employee/attendance*'],
    });

    chrome.contextMenus.create({
        title: '定時出勤',
        contexts: ['all'],
        type: 'normal',
        parentId: MenuID.Base,
        id: MenuID.Attendance,
    });

    chrome.contextMenus.create({
        title: '定時退勤',
        contexts: ['all'],
        type: 'normal',
        parentId: MenuID.Base,
        id: MenuID.Leave,
    });
});

const attendanceAsync = async (tabId: number, url: string) => {
    const ids = await createControlWindow(url);

    const debuggee: chrome.debugger.Debuggee = {
        tabId: ids.tabId,
    };

    const responseHandledStream = new Subject<ResponseBody>();
    const requestMap = new Map<string, ResponseHeader | null>();

    await new Promise((resolve) => chrome.debugger.attach(debuggee, '1.3', () => resolve()));

    // Jobcanのページからのイベント
    chrome.debugger.onEvent.addListener(async (source, method, params: any) => {
        if (method === 'Network.loadingFinished') {
            const requestId = params.requestId;
            const header = requestMap.get(requestId);
            requestMap.delete(requestId);
            const resp = await fetchResponse(debuggee, requestId, header!);
            responseHandledStream.next(resp);
        } else if (method === 'Network.responseReceived') {
            const requestId = params.requestId;
            const header: ResponseHeader = {
                mimeType: params.response.mimeType,
                url: params.response.url,
            };
            requestMap.set(requestId, header);
        }
    });

    chrome.debugger.sendCommand(debuggee, 'Network.enable');

    const summaryStream = responseHandledStream.pipe(
        filter((f) => f.mimeType === 'application/json'),
        filter((f) => f.url.indexOf('https://ssl.jobcan.jp/employee/adit/get-summary/') !== -1),
        distinctUntilChanged((a, b) => a.requestId === b.requestId)
    );

    const editAttendaceStream = responseHandledStream.pipe(
        filter((f) => f.mimeType === 'application/json'),
        filter((f) => f.url.indexOf('https://ssl.jobcan.jp/employee/adit/insert/') !== -1),
        distinctUntilChanged((a, b) => a.requestId === b.requestId)
    );

    await jsonFirst(summaryStream);
    const jobInfo = (await getJobInfoFromTable(ids.tabId)) as [JobState, ...never[]];
    switch (jobInfo[0]) {
        case 0:
        case 2:
            await attendance(ids.tabId, '0930');
            await jsonFirst(editAttendaceStream);
            break;
        default:
            break;
    }

    chrome.debugger.detach(debuggee, () =>
        chrome.tabs.remove(ids.tabId, () => chrome.windows.remove(ids.windowId))
    );
};

const leaveAsync = async (tabId: number, url: string) => {
    const ids = await createControlWindow(url);

    const debuggee: chrome.debugger.Debuggee = {
        tabId: ids.tabId,
    };

    const responseHandledStream = new Subject<ResponseBody>();
    const requestMap = new Map<string, ResponseHeader | null>();

    await new Promise((resolve) => chrome.debugger.attach(debuggee, '1.3', () => resolve()));

    // Jobcanのページからのイベント
    chrome.debugger.onEvent.addListener(async (source, method, params: any) => {
        if (method === 'Network.loadingFinished') {
            const requestId = params.requestId;
            const header = requestMap.get(requestId);
            requestMap.delete(requestId);
            const resp = await fetchResponse(debuggee, requestId, header!);
            responseHandledStream.next(resp);
        } else if (method === 'Network.responseReceived') {
            const requestId = params.requestId;
            const header: ResponseHeader = {
                mimeType: params.response.mimeType,
                url: params.response.url,
            };
            requestMap.set(requestId, header);
        }
    });

    chrome.debugger.sendCommand(debuggee, 'Network.enable');

    const summaryStream = responseHandledStream.pipe(
        filter((f) => f.mimeType === 'application/json'),
        filter((f) => f.url.indexOf('https://ssl.jobcan.jp/employee/adit/get-summary/') !== -1),
        distinctUntilChanged((a, b) => a.requestId === b.requestId)
    );

    const editAttendaceStream = responseHandledStream.pipe(
        filter((f) => f.mimeType === 'application/json'),
        filter((f) => f.url.indexOf('https://ssl.jobcan.jp/employee/adit/insert/') !== -1),
        distinctUntilChanged((a, b) => a.requestId === b.requestId)
    );

    await jsonFirst(summaryStream);
    const jobInfo = (await getJobInfoFromTable(ids.tabId)) as [JobState, ...never[]];
    switch (jobInfo[0]) {
        case 0:
        case 1:
            await leave(ids.tabId, '1830');
            await jsonFirst(editAttendaceStream);
            break;
        default:
            break;
    }

    chrome.debugger.detach(debuggee, () =>
        chrome.tabs.remove(ids.tabId, () => chrome.windows.remove(ids.windowId))
    );
};

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId.indexOf(MenuID.Base) === -1) {
        return;
    }
    if (tab === undefined) {
        return;
    }
    if (tab.url === undefined) {
        return;
    }
    if (tab.url.indexOf('https://ssl.jobcan.jp/employee/attendance') !== -1) {
        const checkedDates = await executeScriptAsync(
            tab.id!,
            `
        Array.from(
            document.querySelectorAll(
              "#search-result > table > tbody > tr > td:nth-child(1) > input[type=checkbox]"
            )
          )
            .filter(v => v.checked)
            .map(v => v.getAttribute("data-href"));
        `
        );

        switch (info.menuItemId) {
            case MenuID.Attendance:
                for (const attendUrl of checkedDates[0]) {
                    await attendanceAsync(tab!.id!, `https://ssl.jobcan.jp${attendUrl}`);
                }
                break;
            case MenuID.Leave:
                for (const attendUrl of checkedDates[0]) {
                    await leaveAsync(tab!.id!, `https://ssl.jobcan.jp${attendUrl}`);
                }
                break;
        }
        return;
    }
});

const createControlWindow = (
    url: string = `chrome-extension://${chrome.runtime.id}/index.html`
): Promise<ControllWindowIds> =>
    new Promise((resolve) =>
        chrome.windows.create({ url, width: 300, height: 300 }, (w) => {
            resolve({
                windowId: w!.id,
                tabId: w!.tabs![0].id!,
            });
        })
    );

const fetchResponse = (
    debuggee: chrome.debugger.Debuggee,
    requestId: string,
    header: ResponseHeader
): Promise<ResponseBody> =>
    new Promise((resolve) =>
        chrome.debugger.sendCommand(
            debuggee,
            'Network.getResponseBody',
            { requestId },
            (result: any) => {
                const responseJson: ResponseBody = {
                    ...header,
                    body: result.body,
                    requestId,
                };

                resolve(responseJson);
            }
        )
    );

const wait = (time: number) =>
    new Promise((resolve) =>
        setTimeout(() => {
            resolve();
        }, time)
    );

const getJobInfoFromTable = (tabId: number) =>
    executeScriptAsync(
        tabId,
        `
if (document.querySelector('#logs-table > div').children.length === 0) {
    // '未打刻';
    0;
} else {
    const att = Array.from(document.querySelectorAll('#logs-table > div > table > tbody > tr'))
    .find(v => v.children[0].innerText.trim() === '出勤') !== undefined ? 1 : 0;
    const lea = Array.from(document.querySelectorAll('#logs-table > div > table > tbody > tr'))
    .find(v => v.children[0].innerText.trim() === '退勤') !== undefined ? 2 : 0;
    att | lea;
}`
    );

const navigate = (tabId: number, value: any) =>
    executeScriptAsync(
        tabId,
        `window.location.href = "https://ssl.jobcan.jp/employee/adit/modify?year=${
            value.year
        }&month=${value.month}&day=${value.date}"`
    );

const attendance = (tabId: number, time: string) =>
    executeScriptAsync(
        tabId,
        `Array.from(document.querySelectorAll('#adit_item_change > select > option'))
        .find(v => v.label.trim() === '出勤').selected = true;`
    )
        .then((_) =>
            executeScriptAsync(tabId, `document.querySelector('#ter_time').value = '${time}'`)
        )
        .then((_) => executeScriptAsync(tabId, `document.querySelector('#insert_button').click()`));

const leave = (tabId: number, time: string) =>
    executeScriptAsync(
        tabId,
        `Array.from(document.querySelectorAll('#adit_item_change > select > option'))
        .find(v => v.label.trim() === '退勤').selected = true;`
    )
        .then((_) =>
            executeScriptAsync(tabId, `document.querySelector('#ter_time').value = '${time}'`)
        )
        .then((_) => executeScriptAsync(tabId, `document.querySelector('#insert_button').click()`));

const executeScriptAsync = (tabId: number, code: string): Promise<any[]> =>
    new Promise((resolve) =>
        chrome.tabs.executeScript(
            tabId,
            {
                code,
            },
            (result) => resolve(result)
        )
    );

const jsonFirst = <T>(observable: Observable<T>): Promise<T> =>
    new Promise((resolve) => observable.pipe(first()).subscribe((x) => resolve(x)));
