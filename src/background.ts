import { from, Observable, Subject, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, first, flatMap, tap } from 'rxjs/operators';
import {
    DateObjectSummary,
    JobState,
    ModifiedAttendanceMessage,
    ProcessMessage,
    SelectDatesMessage,
} from './Contract';

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

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        title: 'JobcanAutomatorを起動する',
        id: 'JobcanAutomator',
        contexts: ['all'],
        type: 'normal',
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'JobcanAutomator') {
        return;
    }
    if (tab === undefined) {
        return;
    }
    if (tab.url === undefined) {
        return;
    }
    if (tab.url.indexOf('https://ssl.jobcan.jp/employee') === -1) {
        return;
    }

    const debuggee: chrome.debugger.Debuggee = {
        tabId: tab!.id,
    };

    const controllWindow = await createControlWindow();
    const disposable = new Subscription();
    const responseHandledStream = new Subject<ResponseBody>();
    const controllerStream = new Subject<ProcessMessage>();
    const requestMap = new Map<string, ResponseHeader | null>();

    chrome.windows.onRemoved.addListener((windowId) => {
        if (windowId === controllWindow.windowId) {
            chrome.debugger.detach(debuggee);
            disposable.unsubscribe();
        }
    });

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

    // ControllWindowとの通信
    chrome.runtime.onMessage.addListener((msg, sender, response) => {
        if (
            sender.tab!.windowId !== controllWindow.windowId ||
            sender.tab!.id !== controllWindow.tabId
        ) {
            return;
        }

        controllerStream.next(msg);
        response();
    });

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

    controllerStream
        .pipe(filter((v) => v.type === 'P2B@SelectDates'))
        .pipe(flatMap((v) => from((v as SelectDatesMessage).dates)))
        .pipe(
            flatMap((v: DateObjectSummary & { index: number }) => {
                const fn = new Promise<
                    DateObjectSummary & { index: number } & { state: JobState; next: JobState }
                >(async (resolve) => {
                    await wait(3000 + Math.random() * 1000); // 攻撃にならないように
                    await navigate(tab.id!, v);
                    await jsonFirst(summaryStream);
                    const jobInfo = (await getJobInfoFromTable(tab.id!)) as [JobState, ...never[]];

                    switch (jobInfo[0]) {
                        case 0:
                            await attendance(tab.id!, '0930');
                            await jsonFirst(editAttendaceStream);
                            await leave(tab.id!, '1830');
                            await jsonFirst(editAttendaceStream);
                            resolve({ ...v, state: jobInfo[0], next: 3 });
                        case 1:
                        case 2:
                        case 3:
                            resolve({ ...v, state: jobInfo[0], next: jobInfo[0] });
                    }
                });
                return from(fn);
            })
        )
        .pipe(
            tap((v) =>
                // tslint:disable-next-line: no-object-literal-type-assertion
                chrome.runtime.sendMessage({
                    type: 'B2P@ModifiedAttendance',
                    date: v,
                } as ModifiedAttendanceMessage)
            )
        )
        .subscribe((v) => console.dir(v));
});

const createControlWindow = (): Promise<ControllWindowIds> =>
    new Promise((resolve) => {
        chrome.windows.create(
            { url: `chrome-extension://${chrome.runtime.id}/index.html`, width: 300, height: 300 },
            (w) => {
                resolve({
                    windowId: w!.id,
                    tabId: w!.tabs![0].id!,
                });
            }
        );
    });

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
