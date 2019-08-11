function arrayDiff(teamsChosen, allteams) {
  var teamsLeft = [];
  allteams = allteams.map(function(item) {
    return item.toString();
  });
  teamsChosen = teamsChosen.map(function(item) {
    return item.toString();
  });
  allteams.forEach(function(team) {
    if(teamsChosen.indexOf(team) <0){
      teamsLeft.push(team)
    };
  });
  return teamsLeft;
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Functions')
      .addItem('Update', 'updateMoneylines')
  .addToUi();
}

function updateMoneylines(){
  var response = UrlFetchApp.fetch('https://98mtd4pkac.execute-api.us-east-1.amazonaws.com/dev');
  setLinesToInt();
  hideRows();
  setRanksToInt();
}

function setLinesToInt(){
  // Entire sheet
  var sheet = SpreadsheetApp.getActive().getSheetByName("Moneyline");
  var range = sheet.getRange('B:B');
  
  // Money format
  range.setNumberFormat("0");
}

function setRanksToInt(){
  // Entire sheet
  var sheet = SpreadsheetApp.getActive().getSheetByName("Rankings");
  var range = sheet.getRange('B:B');
  
  // Money format
  range.setNumberFormat("0");
}

function hideRows() {
  var sheets = ["Jon","Mr. Sabin","JJ"];
  var cols = ["B:B","C:C","D:D"];
  var master = SpreadsheetApp.getActive().getSheetByName("Master")
  for (var i = 0, sLen = sheets.length; i < sLen; i++) {
    var sheet = SpreadsheetApp.getActive().getSheetByName(sheets[i])
    var val = sheet.getRange('A1:R33').getValues();
    var teamsUsed = master.getRange(cols[i]).getValues().map(function(item) {
      return item.toString();
    });
    for (var j = 0, vLen = val.length; j < vLen; j++) {
      if (teamsUsed.indexOf(val[j][0])>=0)
        sheet.hideRows(j + 1)
    }
    for(var k = 1; k<19; k++){
      if(parseInt(val[0][k]) < calculateNFLWeek())
        sheet.hideColumns(k+1)
    }
  }
}

function calculateNFLWeek() {
    var now = new Date()
    var week10 = new Date("November 13, 2018");
    // The number of milliseconds in one week
    var ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
    // Convert both dates to milliseconds
    var date1_ms = now.getTime();
    var date2_ms = week10.getTime();
    // Calculate the difference in milliseconds
    var difference_ms = Math.abs(date1_ms - date2_ms);
    // Convert back to weeks and return hole weeks
    return 10 + Math.ceil(difference_ms / ONE_WEEK);
}
