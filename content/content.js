Array.from(document.querySelectorAll('#search-result > table > tbody > tr')).map((v) => {
    const newElem = document.createElement('td');
    if (v.firstElementChild.firstElementChild !== null) {
        const hrefPath = v.firstElementChild.firstElementChild.getAttribute('href');
        const iElm = document.createElement('input');
        iElm.setAttribute('type', 'checkbox');
        iElm.setAttribute('data-href', hrefPath);
        newElem.appendChild(iElm);
    }
    v.insertBefore(newElem, v.children[0]);
});

const attendanceFunc = () => {
    const checkedDates = Array.from(
        document.querySelectorAll(
            '#search-result > table > tbody > tr > td:nth-child(1) > input[type=checkbox]'
        )
    )
        .filter((v) => v.checked)
        .map((v) => v.getAttribute('data-href'));
    checkedDates.map(async (url) => {
        await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                'lmlanffckkahdjgolglgeabdimikipmo',
                {
                    type: 'attendance',
                    value: url,
                },
                {},
                function(resp) {
                    resolve(resp);
                }
            );
        });
    });
};
