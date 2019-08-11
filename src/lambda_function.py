import bs4
import json
import datetime
import os
import csv
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import re
import gspread
from oauth2client.service_account import ServiceAccountCredentials

class Matchup:
	def __init__(self, team_one, team_two, odds_one, odds_two):
		self.team_one = team_one
		self.team_two = team_two
		self.odds_one = odds_one
		self.odds_two = odds_two

class Rankings:
	def __init__(self, team, ranking):
		self.team = team
		self.ranking = ranking

def team_rename(team_s):
	if team_s == 'Arizona':
		ts = 'ARI'
	elif team_s == 'Atlanta':
		ts = 'ATL'
	elif team_s == 'Baltimore':
		ts = 'BAL'
	elif team_s == 'Buffalo':
		ts = 'BUF'
	elif team_s == 'Carolina':
		ts = 'CAR'
	elif team_s == 'Chicago':
		ts = 'CHI'
	elif team_s == 'Cincinnati':
		ts = 'CIN'
	elif team_s == 'Cleveland':
		ts = 'CLE'
	elif team_s == 'Dallas':
		ts = 'DAL'
	elif team_s == 'Denver':
		ts = 'DEN'
	elif team_s == 'Detroit':
		ts = 'DET'
	elif team_s == 'Green Bay':
		ts = 'GB'
	elif team_s == 'Houston':
		ts = 'HOU'
	elif team_s == 'Indianapolis':
		ts = 'IND'
	elif team_s == 'Jacksonville':
		ts = 'JAC'
	elif team_s == 'Kansas City':
		ts = 'KC'
	elif team_s == 'Miami':
		ts = 'MIA'
	elif team_s == 'Minnesota':
		ts = 'MIN'
	elif team_s == 'New England':
		ts = 'NE'
	elif team_s == 'New Orleans':
		ts = 'NO'
	elif team_s == 'N.Y. Giants':
		ts = 'NYG'
	elif team_s == 'NY Giants':
		ts = 'NYG'
	elif team_s == 'N.Y. Jets':
		ts = 'NYJ'
	elif team_s == 'NY Jets':
		ts = 'NYJ'
	elif team_s == 'Oakland':
		ts = 'OAK'
	elif team_s == 'Philadelphia':
		ts = 'PHI'
	elif team_s == 'Pittsburgh':
		ts = 'PIT'
	elif team_s == 'L.A. Chargers':
		ts = 'LAC'
	elif team_s == 'LA Chargers':
		ts = 'LAC'
	elif team_s == 'San Francisco':
		ts = 'SF'
	elif team_s == 'Seattle':
		ts = 'SEA'
	elif team_s == 'L.A. Rams':
		ts = 'LAR'
	elif team_s == 'LA Rams':
		ts = 'LAR'
	elif team_s == 'Tampa Bay':
		ts = 'TB'
	elif team_s == 'Tennessee':
		ts = 'TEN'
	elif team_s == 'Washington':
		ts = 'WAS'
	else:
		ts = team_s
	return ts

def lambda_handler(arg1, arg2):	
	chrome_options = webdriver.ChromeOptions()
	chrome_options.add_argument('--headless')
	chrome_options.add_argument('--no-sandbox')
	chrome_options.add_argument('--disable-gpu')
	chrome_options.add_argument('--window-size=1280x1696')
	chrome_options.add_argument('--user-data-dir=/tmp/user-data')
	chrome_options.add_argument('--hide-scrollbars')
	chrome_options.add_argument('--enable-logging')
	chrome_options.add_argument('--log-level=0')
	chrome_options.add_argument('--v=99')
	chrome_options.add_argument('--single-process')
	chrome_options.add_argument('--data-path=/tmp/data-path')
	chrome_options.add_argument('--ignore-certificate-errors')
	chrome_options.add_argument('--homedir=/tmp')
	chrome_options.add_argument('--disk-cache-dir=/tmp/cache-dir')
	chrome_options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36')
	chrome_options.binary_location = os.getcwd() + "/bin/headless-chromium"
	 
	driver = webdriver.Chrome(chrome_options=chrome_options)

	driver.get('http://www.vegasinsider.com/nfl/odds/las-vegas/money/')
	# response = session.body()
	soup = bs4.BeautifulSoup(driver.page_source, 'html.parser')
	moneyline_table = soup.find_all('table')[42]
	moneyline_obj = []
	for rownum, row in enumerate(moneyline_table.find_all("tr")):
		if(len(row)>1):
			print("~~~~~~~~~~~~")
			if row.find_all('td')[2].find('a') is None:
				print(row.find_all('td')[1])
				if row.find_all('td')[1].find('a') is None or row.find_all('td')[1].find('a').get_text(strip=True) == '':
					odds='+0+0'
				else:
					odds=row.find_all('td')[1].find('a').get_text(strip=True)
			else:
				print(row.find_all('td')[2])
				odds=row.find_all('td')[2].find('a').get_text(strip=True)
			moneyline_obj.append(Matchup(row.contents[1].find_all('a')[0].text,row.contents[1].find_all('a')[1].text,re.findall(r"((?:-|\+)\d+)((?:-|\+)\d+)", odds)[0][0],re.findall(r"((?:-|\+)\d+)((?:-|\+)\d+)", odds)[0][1]))

	# get power rankings
	power_rankings = []
	driver.get('https://www.oddsshark.com/nfl/power-rankings')
	soup = bs4.BeautifulSoup(driver.page_source, 'html.parser')
	ranking_table = soup.find('table', {'class':'base-table base-table-sortable'})
	for rownum, row in enumerate(ranking_table.find_all("tr")[1:]):
		power_rankings.append(Rankings(row.find_all("td")[0].find("a").text, row.find_all("td")[1].text))


	# use creds to create a client to interact with the Google Drive API
	scope = ['https://spreadsheets.google.com/feeds',
	         'https://www.googleapis.com/auth/drive']
	print("1111")
	creds = ServiceAccountCredentials.from_json_keyfile_name(os.getcwd() + '/src/client_secret.json', scope)
	print("creds")
	print(creds)
	client = gspread.authorize(creds)
	print("client")
	# Find a workbook by name and open the first sheet
	# Make sure you use the right name here.
	sheet = client.open("Survivor Pool").worksheet("Moneyline")
	print("sheet")
	# clear sheet
	# range_of_cells = sheet.range('A1:B36')
	# for cell in range_of_cells:
	#     cell.value = ''
	# sheet.update_cells(range_of_cells) 

	cells_in_a = sheet.range('A1:A32')
	cells_in_b = sheet.range('B1:B32')

	index=0
	num=0
	for cell in cells_in_a:
		if index < len(moneyline_obj):
			if num % 2 ==1:
				cell.value = team_rename(moneyline_obj[index].team_two)
				index+=1
			else: 
				cell.value = team_rename(moneyline_obj[index].team_one)
			num+=1
	sheet.update_cells(cells_in_a)
	
	index=0
	num=0
	for cell in cells_in_b:
		if index < len(moneyline_obj):
			if num % 2 ==1:
				cell.value = moneyline_obj[index].odds_two
				index+=1
			else: 
				cell.value = moneyline_obj[index].odds_one
			num+=1
	sheet.update_cells(cells_in_b)


	sheet = client.open("Survivor Pool").worksheet("Rankings")
	cells_in_a = sheet.range('A1:A32')
	cells_in_b = sheet.range('B1:B32')
	# input team names
	index=0
	for cell in cells_in_a:
		if index < len(power_rankings):
			cell.value = team_rename(power_rankings[index].team)
			index+=1
	sheet.update_cells(cells_in_a)

	# input rankings
	index=0
	for cell in cells_in_a:
		if index < len(power_rankings):
			cell.value = power_rankings[index].ranking
			index+=1
	sheet.update_cells(cells_in_b)
