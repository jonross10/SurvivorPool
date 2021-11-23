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
import logging

logging.getLogger().setLevel(logging.INFO)

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

def get_chrome_options():
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
	chrome_options.add_argument('--disable-dev-shm-usage')
	chrome_options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36')
	chrome_options.binary_location = os.getcwd() + "/bin/headless-chromium"
	return chrome_options

def get_vegas_moneyline(driver):
	driver.get('http://www.vegasinsider.com/nfl/odds/las-vegas/money/')
	soup = bs4.BeautifulSoup(driver.page_source, 'html.parser')
	moneyline_table = soup.find('table', {'class':'frodds-data-tbl'})
	moneyline_obj = []
	for rownum, row in enumerate(moneyline_table.find_all("tr")):
		if(len(row)>1):
			if row.find_all('td')[2].find('a') is None:
				if row.find_all('td')[1].find('a') is None or row.find_all('td')[1].find('a').get_text(strip=True) == '':
					odds='+0+0'
				else:
					odds=row.find_all('td')[1].find('a').get_text(strip=True)
			else:
				odds=row.find_all('td')[2].find('a').get_text(strip=True)
			logging.info(
				"team_one: {team_one}\n team_two: {team_two}\n odds: {odds}".format(
					team_one=row.contents[1].find_all('a')[0].text,
					team_two=row.contents[1].find_all('a')[1].text
					odds=odds
			)
			moneyline_obj.append(
				Matchup(
					row.contents[1].find_all('a')[0].text,
					row.contents[1].find_all('a')[1].text,
					re.findall(r"((?:-|\+)\d+)((?:-|\+)\d+)", odds)[0][0],
					re.findall(r"((?:-|\+)\d+)((?:-|\+)\d+)", odds)[0][1]
				)
			)
	return moneyline_obj

def get_nfl_power_rankings(driver):
	power_rankings = []
	driver.get('https://www.oddsshark.com/nfl/power-rankings')
	soup = bs4.BeautifulSoup(driver.page_source, 'html.parser')
	ranking_table = soup.find('table', {'class':'table table--sortable table--striped table--fixed-column'})
	for rownum, row in enumerate(ranking_table.find_all("tr")[1:]):
		power_rankings.append(Rankings(row.find_all("td")[0].find("a").text, row.find_all("td")[1].text))
	return power_rankings

def update_moneyline_sheet(client, moneyline_obj):
	sheet = client.open("Survivor Pool").worksheet("Moneyline")
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

def update_nfl_rankings_sheet(client, power_rankings):
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


def lambda_handler(arg1, arg2):	
	driver = webdriver.Chrome(chrome_options=get_chrome_options())
	moneyline_obj = get_vegas_moneyline(driver)
	power_rankings = get_nfl_power_rankings(driver)
	scope = ['https://spreadsheets.google.com/feeds',
	         'https://www.googleapis.com/auth/drive']
	creds = ServiceAccountCredentials.from_json_keyfile_name(os.getcwd() + '/src/client_secret.json', scope)
	client = gspread.authorize(creds)
	update_moneyline_sheet(client, moneyline_obj)
	update_nfl_rankings_sheet(client, power_rankings)
	

